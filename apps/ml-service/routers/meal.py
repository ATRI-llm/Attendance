"""Face-counting endpoint used by meal monitoring."""
from __future__ import annotations

import logging
import urllib.request

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.model_registry import model_registry

logger = logging.getLogger("ml-service.meal")
router = APIRouter()


class MealRequest(BaseModel):
    mealSessionId: str
    imageUrls: list[str] = Field(min_length=1)


class MealResponse(BaseModel):
    success: bool
    totalDetected: int
    confidenceScore: float | None = None
    imagesProcessed: int
    imagesSkipped: int


def _download_image(url: str) -> np.ndarray | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "school-ai-ml-service/1.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read()
        return cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception as exc:
        logger.warning("Unable to download meal image %s: %s", url, exc)
        return None


@router.post("", response_model=MealResponse)
def process_meal(body: MealRequest) -> MealResponse:
    try:
        model_registry.require_inference_models()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    detector = model_registry.detector
    assert detector is not None

    total_detected = 0
    confidence_values: list[float] = []
    processed = 0
    skipped = 0

    for url in body.imageUrls:
        image = _download_image(url)
        if image is None:
            skipped += 1
            continue

        try:
            _boxes, scores, _landmarks = detector.detect(image)
            total_detected += int(len(scores))
            confidence_values.extend(float(score) for score in scores)
            processed += 1
        except Exception as exc:
            skipped += 1
            logger.warning("Meal face detection failed for %s: %s", url, exc)

    if processed == 0:
        raise HTTPException(status_code=422, detail="None of the supplied meal images could be processed")

    return MealResponse(
        success=True,
        totalDetected=total_detected,
        confidenceScore=float(np.mean(confidence_values)) if confidence_values else None,
        imagesProcessed=processed,
        imagesSkipped=skipped,
    )
