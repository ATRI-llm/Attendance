# Complete Codebase Cleanup & Local Storage Migration Walkthrough

## 1. Codebase Cleanup Accomplishments

### Removed Dead Folders & Legacy Prototypes
1. **`apps/ml-worker/src/ml/python_service/`**: Entire legacy Jupyter notebook / prototype folder with duplicate ONNX models, `.ipynb` notebooks, test images, and obsolete scratch files.
2. **`apps/backend/models/`**: Redundant duplicate copies of ONNX models.
3. **`apps/ml-worker/src/ml/attendance_system/src/attendance/`**: Obsolete prototype scripts (`attendance_generator.py`, `csv_writer.py`, `predictor.py`).
4. **`apps/ml-worker/src/ml/attendance_system/src/utils/`**: Empty dummy utility files (`file_utils.py`, `csv_utils.py`).
5. **`apps/ml-worker/src/ml/attendance_system/src/dataset_builder/build_embeddings.py`**: Legacy disk-based dataset builder (replaced by database builder `db_dataset_builder.py`).
6. **`apps/ml-worker/src/ml/attendance_system/` old scripts**: `generate_attendance.py`, `process_onboarding.py`, `train_classifier.py`, `TRAIN_CLASSIFIER.md`, `GENERATE_ATTENDANCE.md`.

### Removed Unused Cloud Dependencies & Configs
1. **`apps/backend/package.json`**: Removed `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `cloudinary`, `multer-storage-cloudinary`.
2. **`apps/backend/src/config/cloudinary.ts`**: Removed Cloudinary configuration file.
3. **`apps/backend/src/common/middlewares/upload.middleware.ts`**: Replaced Cloudinary multer storage with standard in-memory storage.
4. **`apps/backend/src/modules/admin/admin.controller.ts`**: Updated student profile image handling to use local folder storage (`saveLocalFile`).
5. **`apps/ml-worker/package.json`**: Removed `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
6. **`apps/ml-service/requirements.txt` & `apps/ml-worker/src/ml/attendance_system/requirements.txt`**: Removed `boto3`.

---

## 2. Final Project Structure

```text
school-ai-monitoring-system/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── common/
│   │   │   │   ├── middlewares/    # Auth, error, memory upload middlewares
│   │   │   │   └── utils/          # geofence, localStorage, password
│   │   │   ├── config/             # redis
│   │   │   ├── database/           # prisma client
│   │   │   ├── modules/            # admin, attendance, auth, face-onboarding, meal, model-sync, teachers
│   │   │   ├── queues/             # BullMQ ml.queue
│   │   │   └── server.ts           # Express entrypoint & model initialization
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── ml-service/
│   │   ├── core/                   # model_registry singleton
│   │   ├── routers/                # onboarding, training
│   │   ├── Dockerfile
│   │   ├── main.py
│   │   └── requirements.txt
│   ├── ml-worker/
│   │   ├── src/
│   │   │   ├── config/             # prisma, redis
│   │   │   ├── ml/
│   │   │   │   └── attendance_system/
│   │   │   │       ├── artifacts/
│   │   │   │       ├── models/
│   │   │   │       ├── src/        # alignment, classifier, dataset_builder, detector, embedding
│   │   │   │       └── train_for_section.py
│   │   │   ├── queues/             # ml.queue
│   │   │   ├── services/           # BullMQ job processors
│   │   │   ├── utils/              # s3Presign (direct URL handler)
│   │   │   └── workers/            # worker loop
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── mobile-teacher/             # React Native / Expo Teacher Application
│   └── web-admin/                  # Next.js Web Admin Dashboard
├── docs/                           # Setup and Integration guides
├── scripts/                        # Automated testing runners
├── docker-compose.yml              # Clean docker compose configuration
├── .env.example                    # Clean environment template
└── README.md / SYSTEM_GUIDE.md
```
