"""FastAPI ML service for onboarding, attendance, meal detection and training."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from core.model_registry import model_registry  # noqa: E402
from routers import attendance, meal, onboarding, training  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("ml-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== ML Service starting ===")
    try:
        model_registry.load_all()
        logger.info("=== ML models loaded; service ready ===")
    except Exception:
        logger.exception("=== ML model startup failed ===")
    yield
    logger.info("=== ML Service shutting down ===")


app = FastAPI(
    title="School AI - ML Service",
    version="1.1.0",
    description="Internal inference and model-training service used by the Node.js ML worker.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(onboarding.router, prefix="/onboard", tags=["Onboarding"])
app.include_router(attendance.router, prefix="/attendance", tags=["Attendance"])
app.include_router(meal.router, prefix="/meal", tags=["Meal"])
app.include_router(training.router, prefix="/train", tags=["Training"])


@app.get("/health", tags=["Health"])
def health_check():
    ready = model_registry.ready
    payload = {
        "status": "ok" if ready else "degraded",
        "ready": ready,
        "detector_ready": model_registry.detector_ready,
        "extractor_ready": model_registry.extractor_ready,
        "model_error": model_registry.load_error,
    }
    return JSONResponse(status_code=200 if ready else 503, content=payload)