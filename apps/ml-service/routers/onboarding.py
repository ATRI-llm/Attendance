"""
routers/onboarding.py

POST /onboard
  Accepts a list of image URLs served by the local backend storage.
  For each image:
    1. Downloads it
    2. Detects the face using SCRFDDetector
    3. Aligns the face
    4. Extracts 512-dim L2-normalized embedding via MobileFaceNet
  Returns all found embeddings.
"""

import logging
import urllib.request

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.model_registry import model_registry, align_face

logger = logging.getLogger("ml-service.onboarding")
router = APIRouter()


# ── Request / Response schemas ────────────────────────────────────

class OnboardRequest(BaseModel):
    imageUrls: list[str]
    studentId: str | None = None  # optional, for logging


class OnboardResponse(BaseModel):
    success: bool
    embeddings: list[list[float]]
    facesFound: int
    modelVersion: str
    skippedImages: int


# ── Helpers ───────────────────────────────────────────────────────

def _download_image(url: str) -> np.ndarray | None:
    """Download an image from a URL and decode it as a BGR numpy array."""
    try:
        req = urllib.request.urlopen(url, timeout=15)
        arr = np.asarray(bytearray(req.read()), dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as exc:
        logger.warning("Failed to download image %s: %s", url, exc)
        return None


# ── Endpoint ──────────────────────────────────────────────────────

@router.post("", response_model=OnboardResponse)
def process_onboarding(body: OnboardRequest) -> OnboardResponse:
    """
    Extract face embeddings from a list of onboarding image URLs.
    Each URL should contain exactly one student face.
    The largest detected face per image is used.
    """
    model_registry.require_inference_models()

    detector = model_registry.detector
    extractor = model_registry.extractor

    embeddings: list[list[float]] = []
    skipped = 0

    for url in body.imageUrls:
        img = _download_image(url)
        if img is None:
            skipped += 1
            continue

        try:
            boxes, scores, landmarks = detector.detect(img)
        except Exception as exc:
            logger.warning("Detection failed for image %s: %s", url, exc)
            skipped += 1
            continue

        if len(boxes) == 0:
            logger.info("No face detected in image %s", url)
            skipped += 1
            continue

        # Pick the face with the highest confidence score
        best_idx = int(np.argmax(scores))

        try:
            aligned = align_face(img, landmarks[best_idx])
            embedding = extractor.get_embedding(aligned)
            embeddings.append(embedding.tolist())
        except Exception as exc:
            logger.warning("Embedding extraction failed: %s", exc)
            skipped += 1
            continue

    logger.info(
        "Onboarding complete | student=%s | images=%d | embeddings=%d | skipped=%d",
        body.studentId or "?",
        len(body.imageUrls),
        len(embeddings),
        skipped,
    )

    if not embeddings:
        raise HTTPException(
            status_code=422,
            detail=(
                f"No faces detected in any of the {len(body.imageUrls)} images. "
                "Ensure each photo clearly shows a single student face."
            ),
        )

    return OnboardResponse(
        success=True,
        embeddings=embeddings,
        facesFound=len(embeddings),
        modelVersion="MobileFaceNet-v1",
        skippedImages=skipped,
    )

