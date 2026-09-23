FROM python:3.11-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
  libglib2.0-0 \
  libgl1 \
  libgomp1 \
  curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/ml-service/requirements.txt ./
RUN pip install --no-cache-dir --no-compile --default-timeout=1000 \
  -r requirements.txt \
  --extra-index-url https://download.pytorch.org/whl/cpu

COPY apps/ml-service/main.py ./
COPY apps/ml-service/core/ ./core/
COPY apps/ml-service/routers/ ./routers/
COPY apps/ml-worker/src/ml/attendance_system/ ./attendance_system/

# Model binaries are optional at build time. Keep the directory present so
# Docker builds work even before the ONNX files are supplied.
COPY apps/ml-service/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

ENV PYTHONPATH="/app/attendance_system:/app"
ENV STORAGE_ROOT="/app/storage"

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health >/dev/null || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
