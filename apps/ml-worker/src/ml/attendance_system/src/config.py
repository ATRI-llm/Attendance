from pathlib import Path
import os

# ============================================================
# PROJECT ROOT
# ============================================================

# attendance_system/
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ============================================================
# MODELS
# ============================================================

MODELS_DIR = PROJECT_ROOT / "models"
DET_MODEL_PATH = MODELS_DIR / "Det_Retina_Net.onnx"
REC_MODEL_PATH = MODELS_DIR / "Rec_Mobile_Net.onnx"
CLASSIFIER_ONNX_PATH = MODELS_DIR / "attendance_classifier.onnx"

# ============================================================
# ARTIFACTS
# ============================================================

ARTIFACT_DIR = PROJECT_ROOT / "artifacts"
EMBEDDINGS_PATH = ARTIFACT_DIR / "embeddings.npy"
TRAINING_METADATA_PATH = ARTIFACT_DIR / "training_metadata.csv"
CLASSIFIER_PTH_PATH = ARTIFACT_DIR / "attendance_classifier.pth"

# ============================================================
# DETECTOR SETTINGS
# ============================================================

DET_INPUT_SIZE = (640, 640)
SCORE_THRESHOLD = 0.50
NMS_THRESHOLD = 0.40
STRIDES = [8, 16, 32]

# ============================================================
# FACE ALIGNMENT
# ============================================================

FACE_SIZE = 112
ARCFACE_DST = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041]
]

# ============================================================
# TRAINING SETTINGS
# ============================================================

BATCH_SIZE = 32
EPOCHS = 50
LEARNING_RATE = 1e-3
CONFIDENCE_THRESHOLD = 0.45

# ============================================================
# CREATE REQUIRED DIRECTORIES
# ============================================================

REQUIRED_DIRS = [
    ARTIFACT_DIR,
    MODELS_DIR,
]

for directory in REQUIRED_DIRS:
    os.makedirs(directory, exist_ok=True)