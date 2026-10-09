#!/usr/bin/env python3
"""
Export a readable codebase context into TXT files.

Run this from the repository root:
    python export_code_context.py

Output:
    _code_context/
        00_project_overview.txt
        01_backend.txt
        02_face_attendance.txt
        03_ml-service.txt
        04_ml-worker.txt
        05_mobile-teacher.txt
        06_web-admin.txt
        07_mobile-student.txt
        08_packages.txt
        09_infra.txt
        10_scripts.txt
        11_root_configs.txt
        12_database.txt
        13_storage.txt
        MANIFEST.txt

Each exported source file is preceded by its repository-relative path.
Secrets, binaries, generated dependencies, caches, model weights, images,
databases, and other large/non-source artifacts are skipped.
"""

from __future__ import annotations

import os
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_code_context"

# Main application areas. Order controls the TXT numbering.
MAJOR_AREAS = [
    ("apps/backend", "01_backend.txt"),
    ("apps/face_attendance", "02_face_attendance.txt"),
    ("apps/ml-service", "03_ml-service.txt"),
    ("apps/ml-worker", "04_ml-worker.txt"),
    ("apps/mobile-teacher", "05_mobile-teacher.txt"),
    ("apps/web-admin", "06_web-admin.txt"),
    # This was present in the project structure and is important even though
    # it was not in the original list supplied by the user.
    ("apps/mobile-student", "07_mobile-student.txt"),
    ("packages", "08_packages.txt"),
    ("infra", "09_infra.txt"),
    ("scripts", "10_scripts.txt"),
]

ROOT_CONFIG_FILES = [
    "README.md",
    "package.json",
    "docker-compose.yml",
    ".dockerignore",
    ".gitignore",
    ".env.example",
    "prisma-schema-sync.sql",
]

# Source/config extensions worth sending as text.
TEXT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".pyi",
    ".java",
    ".kt",
    ".kts",
    ".go",
    ".rs",
    ".cs",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".dart",
    ".sql",
    ".prisma",
    ".json",
    ".jsonc",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".xml",
    ".html",
    ".htm",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".md",
    ".mdx",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
    ".graphql",
    ".gql",
    ".proto",
    ".txt",
}

# Extensionless project/config files that are often important.
TEXT_FILENAMES = {
    "Dockerfile",
    "Makefile",
    "Procfile",
    "LICENSE",
    ".gitignore",
    ".dockerignore",
    ".npmrc",
    ".nvmrc",
    ".python-version",
    ".prettierrc",
    ".eslintrc",
    ".editorconfig",
}

# Never export these directories.
EXCLUDED_DIRS = {
    ".git",
    ".idea",
    ".vscode",
    "__pycache__",
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    ".turbo",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".venv",
    "venv",
    "env",
    "site-packages",
    ".expo",
    ".gradle",
    ".dart_tool",
    "Pods",
    "DerivedData",
}

# Never export these files or patterns.
EXCLUDED_FILENAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "dev.db",
    "database.db",
}

EXCLUDED_SUFFIXES = {
    # Images / media
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".ico",
    ".svg",
    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    # Archives / compiled files
    ".zip",
    ".tar",
    ".gz",
    ".7z",
    ".rar",
    ".dll",
    ".so",
    ".dylib",
    ".exe",
    ".bin",
    ".class",
    ".pyc",
    # ML/model/data artifacts
    ".onnx",
    ".pth",
    ".pt",
    ".safetensors",
    ".npy",
    ".npz",
    ".pkl",
    ".pickle",
    ".joblib",
    ".parquet",
    ".feather",
    # Notebook files are skipped because they can be very large JSON blobs.
    ".ipynb",
}

# Specific directories/files that can explode the output size.
EXCLUDED_PATH_PARTS = {
    "AttendanceFaces",
    "artifacts",
    "finetuned_model",
}

# Safety limit for an individual source file.
MAX_FILE_BYTES = 2 * 1024 * 1024  # 2 MB


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def should_skip(path: Path) -> bool:
    if any(part in EXCLUDED_DIRS for part in path.parts):
        return True

    if any(part in EXCLUDED_PATH_PARTS for part in path.parts):
        return True

    if path.name in EXCLUDED_FILENAMES:
        return True

    # Do not accidentally export arbitrary .env variants.
    if path.name.startswith(".env") and path.name != ".env.example":
        return True

    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return True

    if path.is_symlink():
        return True

    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return True
    except OSError:
        return True

    return False


def is_text_source(path: Path) -> bool:
    return path.name in TEXT_FILENAMES or path.suffix.lower() in TEXT_EXTENSIONS


def iter_files(base: Path):
    if not base.exists():
        return

    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        if should_skip(path):
            continue
        if not is_text_source(path):
            continue
        yield path


def read_text(path: Path) -> str:
    # utf-8 first; fallback keeps unusual source files readable.
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def write_area_file(source_dir: Path, output_file: Path, title: str):
    files = list(iter_files(source_dir))

    with output_file.open("w", encoding="utf-8", newline="\n") as out:
        out.write("=" * 100 + "\n")
        out.write(f"{title}\n")
        out.write(f"Repository root: {ROOT}\n")
        out.write(f"Source directory: {rel(source_dir)}\n")
        out.write(f"Files exported: {len(files)}\n")
        out.write("=" * 100 + "\n\n")

        for path in files:
            relative = rel(path)
            out.write("\n\n")
            out.write("#" * 100 + "\n")
            out.write(f"# FILE: {relative}\n")
            out.write("#" * 100 + "\n\n")

            try:
                content = read_text(path)
            except Exception as exc:
                out.write(f"[Could not read file: {exc}]\n")
                continue

            out.write(content)
            if not content.endswith("\n"):
                out.write("\n")


def write_root_configs():
    output_file = OUT / "11_root_configs.txt"

    with output_file.open("w", encoding="utf-8", newline="\n") as out:
        out.write("=" * 100 + "\n")
        out.write("ROOT-LEVEL CONFIGURATION AND DOCUMENTATION\n")
        out.write("=" * 100 + "\n\n")

        for filename in ROOT_CONFIG_FILES:
            path = ROOT / filename
            if not path.exists() or should_skip(path):
                continue

            out.write("\n\n")
            out.write("#" * 100 + "\n")
            out.write(f"# FILE: {rel(path)}\n")
            out.write("#" * 100 + "\n\n")
            out.write(read_text(path))
            out.write("\n")


def write_database_context():
    """
    Database-specific context is kept separate because Prisma schemas,
    migrations and SQL are especially useful when reasoning about the system.
    """
    output_file = OUT / "12_database.txt"

    candidates = []

    for root_name in ("apps/backend/prisma", "apps/ml-worker/prisma"):
        root = ROOT / root_name
        if root.exists():
            candidates.extend(iter_files(root))

    # Also include root-level database SQL if present.
    for filename in ("prisma-schema-sync.sql",):
        p = ROOT / filename
        if p.exists() and not should_skip(p):
            candidates.append(p)

    # Deduplicate while preserving sorted repository order.
    candidates = sorted({p.resolve(): p for p in candidates}.values(), key=rel)

    with output_file.open("w", encoding="utf-8", newline="\n") as out:
        out.write("=" * 100 + "\n")
        out.write("DATABASE / PRISMA CONTEXT\n")
        out.write("=" * 100 + "\n\n")

        for path in candidates:
            if path.suffix.lower() not in {".prisma", ".sql", ".ts", ".toml"}:
                continue

            out.write("\n\n")
            out.write("#" * 100 + "\n")
            out.write(f"# FILE: {rel(path)}\n")
            out.write("#" * 100 + "\n\n")
            out.write(read_text(path))
            out.write("\n")


def write_overview():
    output_file = OUT / "00_project_overview.txt"

    all_files = []
    for path in ROOT.rglob("*"):
        if path.is_file() and not should_skip(path) and is_text_source(path):
            all_files.append(path)

    counts = defaultdict(int)
    for path in all_files:
        parts = path.relative_to(ROOT).parts
        area = parts[1] if len(parts) >= 2 and parts[0] == "apps" else parts[0]
        counts[area] += 1

    with output_file.open("w", encoding="utf-8", newline="\n") as out:
        out.write("=" * 100 + "\n")
        out.write("PROJECT OVERVIEW / CODEBASE MAP\n")
        out.write("=" * 100 + "\n\n")

        out.write("This file is generated automatically.\n")
        out.write(
            "It describes what was exported and gives a compact source-file inventory.\n\n"
        )

        out.write("SOURCE FILE COUNTS BY TOP-LEVEL AREA\n")
        out.write("-" * 100 + "\n")
        for area, count in sorted(counts.items()):
            out.write(f"{area:40} {count:6} files\n")

        out.write("\n\nEXPORTED MAJOR AREAS\n")
        out.write("-" * 100 + "\n")
        for source, filename in MAJOR_AREAS:
            out.write(f"{source:40} -> {filename}\n")

        out.write("\n\nIMPORTANT EXCLUSIONS\n")
        out.write("-" * 100 + "\n")
        out.write(
            "Secrets (.env except .env.example), node_modules, build output, caches,\n"
        )
        out.write(
            "ML weights/artifacts, images/media, databases, archives and notebooks are skipped.\n"
        )
        out.write(
            "This keeps the context files useful for code reasoning instead of huge/binary-heavy.\n"
        )

        out.write("\n\nFULL SOURCE INVENTORY\n")
        out.write("-" * 100 + "\n")
        for path in sorted(all_files, key=rel):
            out.write(rel(path) + "\n")


def write_manifest():
    output_file = OUT / "MANIFEST.txt"

    with output_file.open("w", encoding="utf-8", newline="\n") as out:
        out.write("CODEBASE CONTEXT EXPORT\n")
        out.write("=" * 100 + "\n\n")
        out.write(f"Repository: {ROOT}\n")
        out.write(f"Output: {OUT}\n\n")

        for path in sorted(OUT.glob("*.txt")):
            if path.name == "MANIFEST.txt":
                continue
            out.write(f"{path.name}\n")

        out.write("\nEach source section contains a line like:\n")
        out.write("# FILE: apps/backend/src/...\n")
        out.write("so the original repository-relative location is always preserved.\n")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # Write the requested major areas plus useful supporting areas.
    for source, filename in MAJOR_AREAS:
        source_dir = ROOT / source
        if source_dir.exists():
            title = f"CODE CONTEXT: {source}"
            write_area_file(source_dir, OUT / filename, title)

    write_root_configs()
    write_database_context()
    write_overview()
    write_manifest()

    print(f"\nExport complete: {OUT}")
    print("Generated files:")
    for path in sorted(OUT.glob("*.txt")):
        print(f"  - {path.name}")


if __name__ == "__main__":
    main()
