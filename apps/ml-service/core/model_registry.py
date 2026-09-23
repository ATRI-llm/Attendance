"""Shared ONNX model registry for the FastAPI ML service."""
from __future__ import annotations

import logging
import sys
from pathlib import Path

logger = logging.getLogger("ml-service.registry")

HERE = Path(__file__).resolve().parent.parent
ATTENDANCE_SYSTEM_LOCAL = HERE.parent / "ml-worker" / "src" / "ml" / "attendance_system"
ATTENDANCE_SYSTEM_DOCKER = Path("/app/attendance_system")

for candidate in (ATTENDANCE_SYSTEM_LOCAL, ATTENDANCE_SYSTEM_DOCKER):
    if candidate.exists() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from src.detector.scrfd_detector import SCRFDDetector  # noqa: E402
from src.alignment.face_alignment import align_face  # noqa: E402
from src.embedding.mobilefacenet import MobileFaceNetExtractor  # noqa: E402


class ModelRegistry:
    def __init__(self) -> None:
        self.detector: SCRFDDetector | None = None
        self.extractor: MobileFaceNetExtractor | None = None
        self.load_error: str | None = None

    def load_all(self) -> None:
        try:
            logger.info("Loading face detector...")
            self.detector = SCRFDDetector()
            logger.info("Face detector loaded")

            logger.info("Loading MobileFaceNet extractor...")
            self.extractor = MobileFaceNetExtractor()
            logger.info("MobileFaceNet extractor loaded")
            self.load_error = None
        except Exception as exc:
            self.detector = None
            self.extractor = None
            self.load_error = str(exc)
            logger.exception("Failed to load ML models")
            raise

    @property
    def detector_ready(self) -> bool:
        return self.detector is not None

    @property
    def extractor_ready(self) -> bool:
        return self.extractor is not None

    @property
    def ready(self) -> bool:
        return self.detector_ready and self.extractor_ready

    def require_inference_models(self) -> None:
        if not self.ready:
            detail = self.load_error or "models are not loaded"
            raise RuntimeError(f"ML inference models are unavailable: {detail}")


model_registry = ModelRegistry()
