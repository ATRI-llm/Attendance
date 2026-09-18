from pathlib import Path
import os

# ============================================================
# PATHS
# ============================================================

ATTENDANCE_SYSTEM_ROOT = Path(__file__).resolve().parent.parent

# Docker and Compose provide STORAGE_ROOT explicitly.
# Local development falls back to the project-root storage directory.

_storage_root_env = os.environ.get("STORAGE_ROOT")

if _storage_root_env:
    STORAGE_ROOT = Path(_storage_root_env).resolve()
else:
    PROJECT_ROOT = ATTENDANCE_SYSTEM_ROOT.parents[4]
    STORAGE_ROOT = (PROJECT_ROOT / "storage").resolve()

# ============================================================
# MODELS
# ============================================================

MODELS_DIR = STORAGE_ROOT / "models"

SHARED_MODELS_DIR = MODELS_DIR / "shared"

SECTION_MODELS_DIR = MODELS_DIR / "sections"

DET_MODEL_PATH = SHARED_MODELS_DIR / "Det_Retina_Net.onnx"

REC_MODEL_PATH = SHARED_MODELS_DIR / "Rec_Mobile_Net.onnx"

# ============================================================
# ARTIFACTS
# ============================================================

ARTIFACTS_DIR = STORAGE_ROOT / "artifacts"

# Backwards-compatible name used by existing modules.
ARTIFACT_DIR = ARTIFACTS_DIR

# ============================================================
# OUTPUT
# ============================================================

OUTPUT_DIR = STORAGE_ROOT / "output"

# ============================================================
# TEMP
# ============================================================

TEMP_DIR = STORAGE_ROOT / "temp"

ONBOARDING_TEMP_DIR = TEMP_DIR / "onboarding"
ATTENDANCE_TEMP_DIR = TEMP_DIR / "attendance"
MEAL_TEMP_DIR = TEMP_DIR / "meal"
TRAINING_TEMP_DIR = TEMP_DIR / "training"

# ============================================================
# DATASET / STUDENT DISCOVERY
# ============================================================

DATASET_DIR = STORAGE_ROOT / "uploads"

STUDENTS_DIR = DATASET_DIR / "face-onboarding"

GROUP_PHOTOS_DIR = DATASET_DIR / "attendance"

# ============================================================
# MODEL / ATTENDANCE FILES
# ============================================================

CLASSIFIER_ONNX_PATH = (
    SECTION_MODELS_DIR / "attendance_classifier.onnx"
)

EMBEDDINGS_PATH = (
    ARTIFACTS_DIR / "embeddings.npy"
)

TRAINING_METADATA_PATH = (
    ARTIFACTS_DIR / "training_metadata.csv"
)

CLASSIFIER_PTH_PATH = (
    ARTIFACTS_DIR / "attendance_classifier.pth"
)

ATTENDANCE_CSV_PATH = (
    OUTPUT_DIR / "attendance.csv"
)

ATTENDANCE_FACES_DIR = (
    OUTPUT_DIR / "AttendanceFaces"
)

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
    [70.7299, 92.2041],
]

# ============================================================
# TRAINING SETTINGS
# ============================================================

BATCH_SIZE = 32

EPOCHS = 50

LEARNING_RATE = 1e-3

# ============================================================
# ATTENDANCE SETTINGS
# ============================================================

CONFIDENCE_THRESHOLD = 0.45

# ============================================================
# IMAGE EXTENSIONS
# ============================================================

VALID_IMAGE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
]

# ============================================================
# REQUIRED DIRECTORIES
# ============================================================

REQUIRED_DIRS = [
    SHARED_MODELS_DIR,
    SECTION_MODELS_DIR,
    ARTIFACTS_DIR,
    OUTPUT_DIR,
    ATTENDANCE_FACES_DIR,
    ONBOARDING_TEMP_DIR,
    ATTENDANCE_TEMP_DIR,
    MEAL_TEMP_DIR,
    TRAINING_TEMP_DIR,
]

for directory in REQUIRED_DIRS:
    directory.mkdir(parents=True, exist_ok=True)

# ============================================================
# STUDENT DISCOVERY
# ============================================================

def get_student_folders():
    """
    Return student directories discovered under local
    face-onboarding storage.
    """

    if not STUDENTS_DIR.exists():
        return []

    return [
        item
        for item in STUDENTS_DIR.iterdir()
        if item.is_dir()
    ]


# ============================================================
# DEBUG INFORMATION
# ============================================================

if __name__ == "__main__":
    PROJECT_ROOT = (
        ATTENDANCE_SYSTEM_ROOT.parents[4]
        if not _storage_root_env
        else STORAGE_ROOT.parent
    )

    print()
    print("=" * 60)
    print("ATTENDANCE SYSTEM CONFIG")
    print("=" * 60)
    print()
    print(f"Attendance system root : {ATTENDANCE_SYSTEM_ROOT}")
    print(f"Storage root           : {STORAGE_ROOT}")
    print(f"Models directory       : {MODELS_DIR}")
    print(f"Shared models          : {SHARED_MODELS_DIR}")
    print(f"Detector model         : {DET_MODEL_PATH}")
    print(f"Recognition model      : {REC_MODEL_PATH}")
    print(f"Artifacts directory    : {ARTIFACTS_DIR}")
    print(f"Output directory       : {OUTPUT_DIR}")
    print()
    print(f"Detector exists        : {DET_MODEL_PATH.exists()}")
    print(f"Recognition exists      : {REC_MODEL_PATH.exists()}")
    print(f"Students found         : {len(get_student_folders())}")
    print()
    print("=" * 60)

# ============================================================
# STUDENT DISCOVERY
# ============================================================

def get_student_folders():
    """
    Return all student folders under local face-onboarding
    storage.

    Expected structure:

        storage/
        └── uploads/
            └── face-onboarding/
                ├── student_01/
                ├── student_02/
                └── ...
    """

    if not STUDENTS_DIR.exists():
        return []

    folders = []

    for item in STUDENTS_DIR.iterdir():
        if (
            item.is_dir()
            and item.name.startswith("student_")
        ):
            folders.append(item.name)

    folders.sort()

    return folders


def get_num_students():
    """
    Dynamically determine the number of student classes
    from the local face-onboarding storage.
    """

    return len(get_student_folders())


# ============================================================
# DEBUG INFORMATION
# ============================================================

if __name__ == "__main__":
    print()
    print("=" * 60)
    print("ATTENDANCE SYSTEM CONFIG")
    print("=" * 60)
    print()
    print(f"Attendance system root : {ATTENDANCE_SYSTEM_ROOT}")
    print(f"Storage root           : {STORAGE_ROOT}")
    print(f"Models directory       : {MODELS_DIR}")
    print(f"Shared models          : {SHARED_MODELS_DIR}")
    print(f"Detector model         : {DET_MODEL_PATH}")
    print(f"Recognition model      : {REC_MODEL_PATH}")
    print(f"Artifacts directory    : {ARTIFACTS_DIR}")
    print(f"Output directory       : {OUTPUT_DIR}")
    print()
    print(f"Detector exists        : {DET_MODEL_PATH.exists()}")
    print(f"Recognition exists      : {REC_MODEL_PATH.exists()}")
    print(f"Students found         : {get_num_students()}")
    print(f"Student folders        : {get_student_folders()}")
    print()
    print("=" * 60)
