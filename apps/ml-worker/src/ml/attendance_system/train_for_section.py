"""
train_for_section.py

Production entrypoint for training the attendance classifier for a section.

Pipeline:
  1. Pull embeddings from DB
  2. Train the NN classifier
  3. Export to ONNX
  4. Store trained models in the shared local storage/models directory
  5. Register the active ModelAsset in the backend database

Training uses local shared storage.
"""

import argparse
import json
import os
import sys
import uuid
import datetime
import shutil

from pathlib import Path


# ============================================================
# PROJECT PATH
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

sys.path.insert(
    0,
    str(PROJECT_ROOT)
)


# ============================================================
# SHARED CONFIG
# ============================================================

from src.config import (
    ARTIFACT_DIR,
    CLASSIFIER_PTH_PATH,
    CLASSIFIER_ONNX_PATH,
    REC_MODEL_PATH,
    MODELS_DIR,
)


from src.dataset_builder.db_dataset_builder import (
    build_db_dataset
)

from src.classifier.train import (
    ClassifierTrainer
)

from src.classifier.export_onnx import (
    ONNXExporter
)


# ============================================================
# LOCAL STORAGE
# ============================================================

def get_storage_root() -> Path:
    """
    Resolve the project-level storage directory.

    Local development:
        <project-root>/storage

    Docker:
        /app/storage
    """

    configured = os.environ.get("STORAGE_ROOT")

    if configured:
        storage_root = Path(configured)

        if not storage_root.is_absolute():
            storage_root = (
                Path.cwd() / storage_root
            ).resolve()
    else:
        storage_root = (
            PROJECT_ROOT.parents[3] / "storage"
        ).resolve()

    storage_root.mkdir(
        parents=True,
        exist_ok=True
    )

    return storage_root


STORAGE_ROOT = get_storage_root()

LOCAL_MODELS_ROOT = (
    STORAGE_ROOT / "models"
)

LOCAL_ARTIFACTS_ROOT = (
    STORAGE_ROOT / "artifacts"
)


# ============================================================
# LOCAL MODEL URL
# ============================================================

def get_backend_base_url() -> str:
    """
    URL used by other services to access files
    through the backend.

    BACKEND_BASE_URL is preferred.

    BACKEND_URL is supported for compatibility:
        http://localhost:5000/api
        -> http://localhost:5000
    """

    base_url = (
        os.environ.get("BACKEND_BASE_URL")
        or os.environ.get("BACKEND_URL")
        or "http://localhost:5000"
    )

    base_url = base_url.rstrip("/")

    if base_url.endswith("/api"):
        base_url = base_url[:-4]

    return base_url.rstrip("/")


def local_model_url(storage_key: str) -> str:
    """
    Convert a local storage model key into a backend URL.

    Example:

        models/sections/<section>/<version>/attendance_classifier.onnx

    becomes:

        http://localhost:5000/models/sections/<section>/<version>/attendance_classifier.onnx
    """

    base_url = get_backend_base_url()

    normalized = (
        storage_key
        .replace("\\", "/")
        .lstrip("/")
    )

    if normalized.startswith("models/"):
        return f"{base_url}/models/{normalized[len('models/'):]}"

    return f"{base_url}/{normalized}"


# ============================================================
# COPY MODEL INTO SHARED STORAGE
# ============================================================

def store_model(
    local_path: Path,
    storage_key: str,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Copy a generated model/artifact into the shared local storage.

    Returns the backend URL for the stored file.
    """

    destination = (
        STORAGE_ROOT / storage_key
    ).resolve()

    storage_root_resolved = STORAGE_ROOT.resolve()

    try:
        destination.relative_to(
            storage_root_resolved
        )
    except ValueError:
        raise ValueError(
            f"Invalid storage key: {storage_key}"
        )

    if not local_path.exists():
        raise FileNotFoundError(
            f"Generated file does not exist: {local_path}"
        )

    destination.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    shutil.copy2(
        local_path,
        destination
    )

    print(
        f"  Stored locally: "
        f"{destination}"
    )

    return local_model_url(
        storage_key
    )


# ============================================================
# REGISTER MODEL ASSET
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
    Register the locally stored model with the backend.

    The backend receives normal HTTP URLs for locally stored files.
    """

    import requests

    backend_url = os.environ.get(
        "BACKEND_URL",
        "http://localhost:5000/api"
    ).rstrip("/")

    token = os.environ.get(
        "BACKEND_TOKEN"
    )

    if not token:
        print(
            "\nWARNING: BACKEND_TOKEN not set."
        )

        print(
            "Skipping automatic model registration."
        )

        print(
            "\nModel information:"
        )

        print(
            f"  sectionId         : {section_id}"
        )

        print(
            f"  backboneVersion   : {backbone_version}"
        )

        print(
            f"  classifierVersion : {classifier_version}"
        )

        print(
            f"  backboneUrl       : {backbone_url}"
        )

        print(
            f"  classifierUrl     : {classifier_url}"
        )

        return

    payload = {
        "sectionId": section_id,
        "backboneVersion": backbone_version,
        "classifierVersion": classifier_version,
        "backboneUrl": backbone_url,
        "classifierUrl": classifier_url,
        "labelMap": label_map,
        "description": description,
    }

    response = requests.post(
        f"{backend_url}/model-sync/register-asset",
        json=payload,
        headers={
            "Authorization":
                f"Bearer {token}"
        },
        timeout=30,
    )

    if response.status_code in (200, 201):

        print(
            "  Model registered successfully:"
        )

        print(
            response.json()
        )

    else:

        print(
            f"  WARNING: Registration returned "
            f"{response.status_code}: "
            f"{response.text}"
        )


# ============================================================
# MAIN PIPELINE
# ============================================================

def run_pipeline(
    section_id: str,
    version_tag: str,
):

    timestamp = (
        datetime.datetime.utcnow()
        .strftime("%Y%m%d-%H%M%S")
    )

    unique_short = (
        uuid.uuid4()
        .hex[:8]
    )

    clean_version = (
        version_tag.lower()
        if version_tag.lower().startswith("v")
        else f"v{version_tag}"
    )

    classifier_version = (
        f"{clean_version}-{unique_short}"
    )

    backbone_version = (
        "MobileFaceNet-v1"
    )

    print(
        "\n" + "=" * 60
    )

    print(
        "ATTENDANCE CLASSIFIER TRAINING PIPELINE"
    )

    print(
        "=" * 60
    )

    print(
        f"Section ID         : {section_id}"
    )

    print(
        f"Classifier Version : {classifier_version}"
    )

    print(
        f"Backbone Version   : {backbone_version}"
    )

    print(
        f"Storage Root       : {STORAGE_ROOT}"
    )


    # ========================================================
    # STEP 1
    # ========================================================

    print(
        "\n[1/5] Building dataset from database..."
    )

    (
        embeddings,
        labels,
        class_map,
        reverse_map,
    ) = build_db_dataset(
        section_id
    )

    num_classes = len(
        class_map
    )

    if num_classes < 2:

        raise ValueError(
            f"Only {num_classes} student(s) "
            "with embeddings found. "
            "Need at least 2 to train "
            "a classifier."
        )


    # ========================================================
    # STEP 2
    # ========================================================

    print(
        "\n[2/5] Training classifier..."
    )

    trainer = ClassifierTrainer()

    model = trainer.train()

    trainer.evaluate(
        model
    )


    # ========================================================
    # STEP 3
    # ========================================================

    print(
        "\n[3/5] Exporting to ONNX..."
    )

    exporter = ONNXExporter()

    exporter.export()


    # ========================================================
    # STEP 4
    # ========================================================

    print(
        "\n[4/5] Storing models locally..."
    )

    section_model_prefix = (
        f"models/sections/"
        f"{section_id}/"
        f"{classifier_version}"
    )

    classifier_key = (
        f"{section_model_prefix}/"
        f"attendance_classifier.onnx"
    )

    label_map_key = (
        f"{section_model_prefix}/"
        f"label_map.json"
    )

    reverse_map_key = (
        f"{section_model_prefix}/"
        f"reverse_label_map.json"
    )

    backbone_key = (
        "models/shared/"
        "Rec_Mobile_Net.onnx"
    )


    classifier_url = store_model(
        CLASSIFIER_ONNX_PATH,
        classifier_key,
    )


    label_map_path = (
        ARTIFACT_DIR /
        "label_map.json"
    )

    reverse_map_path = (
        ARTIFACT_DIR /
        "reverse_label_map.json"
    )


    store_model(
        label_map_path,
        label_map_key,
        "application/json",
    )


    store_model(
        reverse_map_path,
        reverse_map_key,
        "application/json",
    )


    backbone_url = store_model(
        REC_MODEL_PATH,
        backbone_key,
    )


    # ========================================================
    # STEP 5
    # ========================================================

    print(
        "\n[5/5] Registering model asset in backend..."
    )

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


    print(
        "\n" + "=" * 60
    )

    print(
        "PIPELINE COMPLETE"
    )

    print(
        "=" * 60
    )

    print(
        f"  Samples trained    : {len(labels)}"
    )

    print(
        f"  Num classes        : {num_classes}"
    )

    print(
        f"  Classifier version : {classifier_version}"
    )

    print(
        f"  Classifier URL     : {classifier_url}"
    )

    print(
        f"  Backbone URL       : {backbone_url}"
    )

    print()


    return {
        "classifierVersion":
            classifier_version,

        "backboneVersion":
            backbone_version,

        "classifierUrl":
            classifier_url,

        "backboneUrl":
            backbone_url,

        "numClasses":
            num_classes,

        "numSamples":
            int(len(labels)),
    }


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description=(
            "Train attendance classifier "
            "for a section"
        )
    )

    parser.add_argument(
        "--section-id",
        required=True,
        help="UUID of the section to train for",
    )

    parser.add_argument(
        "--version",
        default="v1",
        help=(
            "Short version tag "
            "(e.g. v1, v2)."
        ),
    )

    args = parser.parse_args()

    result = run_pipeline(
        section_id=args.section_id,
        version_tag=args.version,
    )

    print(
        json.dumps(
            result,
            indent=2
        )
    )
