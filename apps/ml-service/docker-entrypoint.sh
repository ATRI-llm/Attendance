#!/bin/sh
set -eu

MODEL_DIR="${STORAGE_ROOT:-/app/storage}/models/shared"
mkdir -p "$MODEL_DIR"

copy_model() {
  name="$1"
  if [ -f "/app/base-models/$name" ] && [ ! -f "$MODEL_DIR/$name" ]; then
    cp "/app/base-models/$name" "$MODEL_DIR/$name"
  fi
}

copy_model "Det_Retina_Net.onnx"
copy_model "Rec_Mobile_Net.onnx"

exec "$@"
