import argparse
import json
import cv2
import numpy as np
import urllib.request
import urllib.parse
import sys
import os
from pathlib import Path


# ============================================================
# PROJECT ROOT
# ============================================================

# attendance_system/
ATTENDANCE_SYSTEM_ROOT = Path(__file__).resolve().parent

# school-ai-monitoring-system/
PROJECT_ROOT = ATTENDANCE_SYSTEM_ROOT.parents[3]

sys.path.insert(
    0,
    str(ATTENDANCE_SYSTEM_ROOT)
)

from src.detector.scrfd_detector import SCRFDDetector
from src.alignment.face_alignment import align_face
from src.embedding.mobilefacenet import MobileFaceNetExtractor


# ============================================================
# LOCAL STORAGE
# ============================================================

STORAGE_ROOT = Path(
    os.environ.get(
        "STORAGE_ROOT",
        str(PROJECT_ROOT / "storage"),
    )
).resolve()


def storage_key_to_path(value):
    """
    Convert a local storage key into an absolute filesystem path.

    Example:

        uploads/face-onboarding/student123/session456/photo.jpg

    becomes:

        <project>/storage/uploads/face-onboarding/
        student123/session456/photo.jpg
    """

    normalized = value.replace(
        "\\",
        "/"
    ).lstrip("/")

    storage_path = (
        STORAGE_ROOT /
        Path(normalized)
    ).resolve()

    # Prevent paths from escaping STORAGE_ROOT.
    try:
        storage_path.relative_to(
            STORAGE_ROOT
        )
    except ValueError:
        raise ValueError(
            "Invalid local storage path"
        )

    return storage_path


# ============================================================
# URL / LOCAL FILE -> IMAGE
# ============================================================

def url_to_image(url):
    """
    Load an image from either:

    1. Local storage URL:
       http://localhost:5000/uploads/...

    2. Local storage key:
       uploads/face-onboarding/...

    3. Normal HTTP/HTTPS URL.

    The function returns an OpenCV image or None.
    """

    try:
        # ----------------------------------------------------
        # Local storage key
        # ----------------------------------------------------
        if (
            not url.startswith("http://")
            and not url.startswith("https://")
            and not url.startswith("file://")
        ):
            local_path = storage_key_to_path(
                url
            )

            if not local_path.exists():
                raise FileNotFoundError(
                    f"Local image not found: {local_path}"
                )

            image_bytes = (
                local_path.read_bytes()
            )

            arr = np.frombuffer(
                image_bytes,
                dtype=np.uint8
            )

            return cv2.imdecode(
                arr,
                cv2.IMREAD_COLOR
            )

        # ----------------------------------------------------
        # file:// URL
        # ----------------------------------------------------
        if url.startswith("file://"):
            parsed = urllib.parse.urlparse(
                url
            )

            local_path = Path(
                urllib.request.url2pathname(
                    parsed.path
                )
            ).resolve()

            if not local_path.exists():
                raise FileNotFoundError(
                    f"Local image not found: {local_path}"
                )

            image_bytes = (
                local_path.read_bytes()
            )

            arr = np.frombuffer(
                image_bytes,
                dtype=np.uint8
            )

            return cv2.imdecode(
                arr,
                cv2.IMREAD_COLOR
            )

        # ----------------------------------------------------
        # Backend local upload URL
        # ----------------------------------------------------
        parsed = urllib.parse.urlparse(
            url
        )

        if parsed.path.startswith(
            "/uploads/"
        ):
            storage_key = (
                parsed.path
                .lstrip("/")
            )

            local_path = storage_key_to_path(
                storage_key
            )

            if local_path.exists():
                image_bytes = (
                    local_path.read_bytes()
                )

                arr = np.frombuffer(
                    image_bytes,
                    dtype=np.uint8
                )

                return cv2.imdecode(
                    arr,
                    cv2.IMREAD_COLOR
                )

        # ----------------------------------------------------
        # HTTP / HTTPS fallback
        # ----------------------------------------------------
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent":
                    "school-ai-monitoring-ml-worker"
            }
        )

        with urllib.request.urlopen(
            req,
            timeout=30
        ) as response:

            image_bytes = response.read()

        arr = np.frombuffer(
            image_bytes,
            dtype=np.uint8
        )

        return cv2.imdecode(
            arr,
            cv2.IMREAD_COLOR
        )

    except Exception as e:
        print(
            f"Error loading {url}: {e}",
            file=sys.stderr
        )

        return None


# ============================================================
# ONBOARDING PROCESSING
# ============================================================

def process_onboarding(urls):

    detector = SCRFDDetector()

    extractor = MobileFaceNetExtractor()

    embeddings = []

    for url in urls:

        img = url_to_image(
            url
        )

        if img is None:
            continue

        boxes, scores, landmarks = (
            detector.detect(img)
        )

        # We assume only 1 student face per
        # onboarding photo, so we take the
        # most prominent one.
        if len(boxes) > 0:

            # Existing behavior:
            # use the first detected face.
            aligned_face = align_face(
                img,
                landmarks[0]
            )

            embedding = (
                extractor.get_embedding(
                    aligned_face
                )
            )

            embeddings.append(
                embedding.tolist()
            )

    result = {
        "success": True,

        "embeddings": embeddings,

        "facesFound": len(
            embeddings
        ),

        "modelVersion":
            "MobileFaceNet-v1",
    }

    print(
        json.dumps(result)
    )


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "Extract embeddings for onboarding"
        )
    )

    parser.add_argument(
        "--urls",
        required=True,
        help=(
            "JSON string array of image URLs"
        ),
    )

    args = parser.parse_args()

    try:

        urls = json.loads(
            args.urls
        )

        process_onboarding(
            urls
        )

    except Exception as e:

        error_result = {
            "success": False,
            "error": str(e),
        }

        print(
            json.dumps(
                error_result
            )
        )

        sys.exit(1)