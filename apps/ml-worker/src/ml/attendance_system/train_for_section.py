"""
train_for_section.py

Production entrypoint for training the attendance classifier for a section.

Pipeline:
  1. Pull embeddings from DB (StudentFaceEmbedding + AttendanceCropImage)
  2. Train the NN classifier (512 -> 128 -> N_students)
  3. Export to ONNX
  4. Save model files locally in section directory hierarchy
  5. Register as the active ModelAsset in the backend database

Usage:
  cd apps/ml-worker/src/ml/attendance_system
  python -m train_for_section --section-id <UUID> [--version v1]

Environment variables required:
  DATABASE_URL          PostgreSQL connection string
  BACKEND_URL           e.g. http://localhost:5000/api
  BACKEND_TOKEN         Admin JWT token to call /api/model-sync/register-asset
"""

import argparse
import json
import os
import sys
import uuid
import datetime

from pathlib import Path

# Resolve project root so `src.*` imports work
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.config import (
    ARTIFACT_DIR,
    CLASSIFIER_PTH_PATH,
    CLASSIFIER_ONNX_PATH,
    REC_MODEL_PATH,
    MODELS_DIR,
)
from src.dataset_builder.db_dataset_builder import build_db_dataset
from src.classifier.train import ClassifierTrainer
from src.classifier.export_onnx import ONNXExporter


import shutil
import psycopg2
from src.dataset_builder.db_dataset_builder import _get_conn


# ============================================================
# LOCAL MODEL STORAGE & HIERARCHY
# ============================================================

def _get_uploads_dir() -> Path:
    """Resolve the root uploads folder across local dev and Docker environments."""
    env_dir = os.environ.get("UPLOADS_DIR")
    if env_dir:
        p = Path(env_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    docker_uploads = Path("/app/uploads")
    if docker_uploads.exists():
        return docker_uploads

    backend_uploads = Path(__file__).resolve().parents[4] / "backend" / "uploads"
    backend_uploads.mkdir(parents=True, exist_ok=True)
    return backend_uploads


def _fetch_section_hierarchy(section_id: str) -> dict:
    """Fetch school ID, class/standard value, and section name from the DB."""
    conn = _get_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT s.id as section_id, s.name as section_name,
                   st.value as class_value, sc.id as school_id
            FROM "Section" s
            JOIN "Standard" st ON s."standardId" = st.id
            JOIN "School" sc ON st."schoolId" = sc.id
            WHERE s.id = %s
            """,
            (section_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Section {section_id} not found in database.")
        return {
            "section_id": row[0],
            "section_name": row[1],
            "class_value": row[2],
            "school_id": row[3],
        }
    finally:
        cur.close()
        conn.close()


# ============================================================
# REGISTER ASSET IN BACKEND
# ============================================================

def register_model_asset(
    section_id: str,
    backbone_version: str,
    classifier_version: str,
    backbone_url: str,
    classifier_url: str,
    label_map: dict,
    description: str,
):
    """
    Call POST /api/model-sync/register-asset to persist the new
    ModelAsset in the production DB and set it as active for the section.
    """
    import requests

    backend_url = os.environ.get("BACKEND_URL", "http://localhost:5000/api")
    token = os.environ.get("BACKEND_TOKEN")

    if not token:
        print(
            "\n  WARNING: BACKEND_TOKEN not set. "
            "Skipping automatic model registration.\n"
            "  Manually call POST /api/model-sync/register-asset with:\n"
            f"    sectionId          : {section_id}\n"
            f"    backboneVersion    : {backbone_version}\n"
            f"    classifierVersion  : {classifier_version}\n"
            f"    backboneUrl        : {backbone_url}\n"
            f"    classifierUrl      : {classifier_url}\n"
        )
        return

    payload = {
        "sectionId": section_id,
        "backboneVersion": backbone_version,
        "classifierVersion": classifier_version,
        "backboneUrl": backbone_url,
        "classifierUrl": classifier_url,
        "labelMap": label_map,       # { roll_str -> class_id } for audit trail
        "description": description,
    }

    resp = requests.post(
        f"{backend_url}/model-sync/register-asset",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )

    if resp.status_code in (200, 201):
        print(f"  Model registered successfully: {resp.json()}")
    else:
        print(
            f"  WARNING: Registration returned {resp.status_code}: "
            f"{resp.text}"
        )


# ============================================================
# MAIN PIPELINE
# ============================================================

def run_pipeline(section_id: str, version_tag: str):
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d-%H%M%S")

    unique_short = uuid.uuid4().hex[:8]
    clean_version = version_tag.lower() if version_tag.lower().startswith('v') else f"v{version_tag}"
    classifier_version = f"{clean_version}-{unique_short}"
    backbone_version = "MobileFaceNet-v1"  # backbone never changes

    print("\n" + "=" * 60)
    print("ATTENDANCE CLASSIFIER TRAINING PIPELINE")
    print("=" * 60)
    print(f"Section ID         : {section_id}")
    print(f"Classifier Version : {classifier_version}")
    print(f"Backbone Version   : {backbone_version}")

    # Fetch section hierarchy for structured local storage
    hierarchy = _fetch_section_hierarchy(section_id)
    school_id = hierarchy["school_id"]
    class_val = hierarchy["class_value"]
    sanitized_sec = hierarchy["section_name"].replace(" ", "_").replace("/", "_")

    # ── Step 1: Build dataset from DB ───────────────────────────
    print("\n[1/5] Building dataset from database...")
    embeddings, labels, class_map, reverse_map = build_db_dataset(section_id)

    num_classes = len(class_map)
    if num_classes < 2:
        raise ValueError(
            f"Only {num_classes} student(s) with embeddings found. "
            "Need at least 2 to train a classifier."
        )

    # ── Step 2: Train classifier ─────────────────────────────────
    print("\n[2/5] Training classifier...")
    trainer = ClassifierTrainer()
    model = trainer.train()
    trainer.evaluate(model)

    # ── Step 3: Export to ONNX ───────────────────────────────────
    print("\n[3/5] Exporting to ONNX...")
    exporter = ONNXExporter()
    exporter.export()

    # ── Step 4: Save models locally in section folder ────────────
    print("\n[4/5] Saving model files locally in folder hierarchy...")
    uploads_dir = _get_uploads_dir()
    
    relative_model_dir = (
        f"schools/{school_id}/class_{class_val}/section_{sanitized_sec}/models/{classifier_version}"
    )
    target_model_dir = uploads_dir / relative_model_dir
    target_model_dir.mkdir(parents=True, exist_ok=True)

    # Copy classifier ONNX and label maps
    dest_clf_onnx = target_model_dir / "attendance_classifier.onnx"
    shutil.copyfile(CLASSIFIER_ONNX_PATH, dest_clf_onnx)

    label_map_path = ARTIFACT_DIR / "label_map.json"
    reverse_map_path = ARTIFACT_DIR / "reverse_label_map.json"
    shutil.copyfile(label_map_path, target_model_dir / "label_map.json")
    shutil.copyfile(reverse_map_path, target_model_dir / "reverse_label_map.json")

    # Ensure shared backbone model is in uploads/models/shared/
    shared_models_dir = uploads_dir / "models" / "shared"
    shared_models_dir.mkdir(parents=True, exist_ok=True)
    shared_backbone_dest = shared_models_dir / "Rec_Mobile_Net.onnx"
    if not shared_backbone_dest.exists() and REC_MODEL_PATH.exists():
        shutil.copyfile(REC_MODEL_PATH, shared_backbone_dest)

    # Build local URLs
    backend_base = (
        os.environ.get("LOCAL_UPLOAD_BASE_URL")
        or os.environ.get("BACKEND_BASE_URL", "http://localhost:5000")
    )
    if backend_base.endswith("/api"):
        backend_base = backend_base[:-4]

    classifier_url = f"{backend_base}/uploads/{relative_model_dir}/attendance_classifier.onnx"
    backbone_url = f"{backend_base}/uploads/models/shared/Rec_Mobile_Net.onnx"

    print(f"  Classifier saved to: {dest_clf_onnx}")
    print(f"  Classifier URL     : {classifier_url}")
    print(f"  Backbone URL       : {backbone_url}")

    # ── Step 5: Register ModelAsset in backend ───────────────────
    print("\n[5/5] Registering model asset in backend...")
    description = (
        f"Trained on {len(labels)} samples | "
        f"{num_classes} students | "
        f"Section {section_id} | "
        f"{timestamp}"
    )

    register_model_asset(
        section_id=section_id,
        backbone_version=backbone_version,
        classifier_version=classifier_version,
        backbone_url=backbone_url,
        classifier_url=classifier_url,
        label_map=class_map,
        description=description,
    )

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"  Samples trained   : {len(labels)}")
    print(f"  Num classes       : {num_classes}")
    print(f"  Classifier version: {classifier_version}")
    print(f"  Classifier URL    : {classifier_url}")
    print(f"  Backbone URL      : {backbone_url}")
    print()

    return {
        "classifierVersion": classifier_version,
        "backboneVersion": backbone_version,
        "classifierUrl": classifier_url,
        "backboneUrl": backbone_url,
        "numClasses": num_classes,
        "numSamples": int(len(labels)),
    }



# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train attendance classifier for a section"
    )
    parser.add_argument(
        "--section-id",
        required=True,
        help="UUID of the section to train for",
    )
    parser.add_argument(
        "--version",
        default="v1",
        help="Short version tag (e.g. v1, v2). Appended to classifier version string.",
    )
    args = parser.parse_args()

    result = run_pipeline(
        section_id=args.section_id,
        version_tag=args.version,
    )

    print(json.dumps(result, indent=2))
