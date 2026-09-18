"""
routers/training.py

POST /train
  Triggers the full classifier training pipeline for a section.
  Returns immediately with a job_id (training runs in the background).
  Poll GET /train/{job_id} to check status.

The training pipeline:
  1. build_db_dataset(section_id) — pull embeddings from PostgreSQL
  2. ClassifierTrainer.train()     — PyTorch NN training
  3. ONNXExporter.export()         — export to .onnx
  4. Store backbone + classifier in shared local storage
  5. POST /api/model-sync/register-asset → backend DB
"""

import logging
import threading
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

# Importing model_registry first ensures sys.path is set correctly for
# the attendance_system package (handles both local dev and Docker paths)
from core.model_registry import model_registry  # noqa: F401

from train_for_section import run_pipeline

logger = logging.getLogger("ml-service.training")
router = APIRouter()

# ── In-memory job store (sufficient for single-worker service) ────
# Keys: job_id str  →  dict with keys: status, result, error, started_at, completed_at
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


# ── Schemas ───────────────────────────────────────────────────────

class TrainRequest(BaseModel):
    sectionId: str
    version: str = "v1"


class TrainJobAccepted(BaseModel):
    jobId: str
    status: Literal["queued"]
    message: str


class TrainJobStatus(BaseModel):
    jobId: str
    status: Literal["queued", "running", "completed", "failed"]
    result: dict | None = None
    error: str | None = None
    startedAt: str | None = None
    completedAt: str | None = None


# ── Background task ───────────────────────────────────────────────

def _run_training_job(job_id: str, section_id: str, version: str):
    """Run the full training pipeline synchronously in a background thread."""
    with _jobs_lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["startedAt"] = datetime.utcnow().isoformat()

    logger.info("[job=%s] Starting training for section %s", job_id, section_id)
    try:
        result = run_pipeline(section_id=section_id, version_tag=version)

        with _jobs_lock:
            _jobs[job_id]["status"] = "completed"
            _jobs[job_id]["result"] = result
            _jobs[job_id]["completedAt"] = datetime.utcnow().isoformat()

        logger.info("[job=%s] Training completed: %s", job_id, result)

    except Exception as exc:
        error_msg = str(exc)
        with _jobs_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = error_msg
            _jobs[job_id]["completedAt"] = datetime.utcnow().isoformat()

        logger.error("[job=%s] Training FAILED: %s", job_id, error_msg, exc_info=True)


# ── Endpoints ─────────────────────────────────────────────────────

@router.post("", response_model=TrainJobAccepted, status_code=202)
def start_training(body: TrainRequest, background_tasks: BackgroundTasks) -> TrainJobAccepted:
    """
    Start classifier training for a section in the background.
    Returns a job_id immediately — poll GET /train/{job_id} for status.
    """
    job_id = str(uuid.uuid4())

    with _jobs_lock:
        _jobs[job_id] = {
            "status": "queued",
            "result": None,
            "error": None,
            "startedAt": None,
            "completedAt": None,
        }

    # Use BackgroundTasks so FastAPI responds 202 immediately
    background_tasks.add_task(
        _run_training_job, job_id, body.sectionId, body.version
    )

    logger.info(
        "Training job queued | job_id=%s | section=%s | version=%s",
        job_id, body.sectionId, body.version,
    )

    return TrainJobAccepted(
        jobId=job_id,
        status="queued",
        message=(
            f"Training started for section {body.sectionId}. "
            f"Poll GET /train/{job_id} for status."
        ),
    )


@router.get("/{job_id}", response_model=TrainJobStatus)
def get_training_status(job_id: str) -> TrainJobStatus:
    """Poll the status of a training job."""
    with _jobs_lock:
        job = _jobs.get(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail=f"Training job {job_id} not found.",
        )

    return TrainJobStatus(
        jobId=job_id,
        status=job["status"],
        result=job.get("result"),
        error=job.get("error"),
        startedAt=job.get("startedAt"),
        completedAt=job.get("completedAt"),
    )


