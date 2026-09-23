"""Face-based attendance inference endpoint."""
from __future__ import annotations

import logging
import os
import urllib.request

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.model_registry import align_face, model_registry

logger = logging.getLogger("ml-service.attendance")
router = APIRouter()


class StudentEmbedding(BaseModel):
    studentId: str
    embedding: list[float] = Field(min_length=1)
    modelVersion: str | None = None


class AttendanceRequest(BaseModel):
    attendanceSessionId: str
    sectionId: str
    imageUrls: list[str] = Field(min_length=1)
    studentEmbeddings: list[StudentEmbedding] = Field(min_length=1)


class AttendanceRecord(BaseModel):
    studentId: str
    status: str
    confidence: float | None = None


class AttendanceResponse(BaseModel):
    success: bool
    results: list[AttendanceRecord]
    totalHeads: int
    detectedCount: int
    absentCount: int
    avgConfidence: float | None = None


def _download_image(url: str) -> np.ndarray | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "school-ai-ml-service/1.0"})
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read()
        image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
        return image
    except Exception as exc:
        logger.warning("Unable to download attendance image %s: %s", url, exc)
        return None


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_norm = float(np.linalg.norm(a))
    b_norm = float(np.linalg.norm(b))
    if a_norm == 0.0 or b_norm == 0.0:
        return -1.0
    return float(np.dot(a, b) / (a_norm * b_norm))


def _threshold() -> float:
    raw = os.getenv("FACE_MATCH_THRESHOLD", "0.55")
    try:
        value = float(raw)
    except ValueError:
        value = 0.55
    return min(max(value, -1.0), 1.0)


@router.post("", response_model=AttendanceResponse)
def process_attendance(body: AttendanceRequest) -> AttendanceResponse:
    try:
        model_registry.require_inference_models()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    detector = model_registry.detector
    extractor = model_registry.extractor
    assert detector is not None and extractor is not None

    candidates: dict[str, list[np.ndarray]] = {}
    for item in body.studentEmbeddings:
        try:
            vector = np.asarray(item.embedding, dtype=np.float32)
            if vector.ndim != 1 or vector.size == 0 or not np.isfinite(vector).all():
                raise ValueError("invalid embedding")
            candidates.setdefault(item.studentId, []).append(vector)
        except Exception as exc:
            logger.warning("Skipping invalid embedding for student %s: %s", item.studentId, exc)

    if not candidates:
        raise HTTPException(status_code=422, detail="No valid student embeddings supplied")

    best_by_student: dict[str, float] = {}
    total_heads = 0
    threshold = _threshold()

    for url in body.imageUrls:
        image = _download_image(url)
        if image is None:
            continue

        try:
            boxes, scores, landmarks = detector.detect(image)
        except Exception as exc:
            logger.warning("Face detection failed for %s: %s", url, exc)
            continue

        total_heads += int(len(boxes))
        for index in range(len(boxes)):
            try:
                aligned = align_face(image, landmarks[index])
                embedding = np.asarray(extractor.get_embedding(aligned), dtype=np.float32)
            except Exception as exc:
                logger.warning("Face embedding extraction failed for %s: %s", url, exc)
                continue

            best_student: str | None = None
            best_score = -1.0
            for student_id, vectors in candidates.items():
                score = max(_cosine_similarity(embedding, vector) for vector in vectors)
                if score > best_score:
                    best_student = student_id
                    best_score = score

            if best_student is not None and best_score >= threshold:
                previous = best_by_student.get(best_student)
                if previous is None or best_score > previous:
                    best_by_student[best_student] = best_score

    results: list[AttendanceRecord] = []
    for student_id in candidates:
        score = best_by_student.get(student_id)
        results.append(
            AttendanceRecord(
                studentId=student_id,
                status="PRESENT" if score is not None else "ABSENT",
                confidence=score,
            )
        )

    matched = [r.confidence for r in results if r.confidence is not None]
    avg_confidence = float(np.mean(matched)) if matched else None

    return AttendanceResponse(
        success=True,
        results=results,
        totalHeads=total_heads,
        detectedCount=len(best_by_student),
        absentCount=sum(1 for record in results if record.status == "ABSENT"),
        avgConfidence=avg_confidence,
    )
