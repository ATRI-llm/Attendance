/**
 * types/model.types.ts
 * Types for model assets and student embedding cache.
 */

// ─────────────────────────────────────────────────────────────────
// ModelAsset — describes a versioned pair of backbone + classifier
// downloaded from the server for offline inference
// ─────────────────────────────────────────────────────────────────

export interface ModelAsset {
  id: string;
  backboneVersion: string;    // e.g. "MobileFaceNet-v1"
  classifierVersion: string;  // e.g. "nn-classifier-v2"
  sectionId: string;
  backboneUrl: string;        // HTTP URL to download backbone .onnx
  classifierUrl: string;      // HTTP URL to download classifier .onnx
  trainedAt: string;          // ISO timestamp
  description?: string;
}

// ─────────────────────────────────────────────────────────────────
// LocalModelAsset — stored in SQLite after download
// ─────────────────────────────────────────────────────────────────

export interface LocalModelAsset {
  id: string;
  backboneVersion: string;
  classifierVersion: string;
  sectionId: string;
  backbonePath: string;       // local file system path
  classifierPath: string;     // local file system path
  isActive: boolean;          // currently loaded in memory
  downloadedAt: string;       // ISO timestamp
}

// ─────────────────────────────────────────────────────────────────
// SectionStudentCache — all students with their reference embeddings
// downloaded from GET /model-sync/embeddings/:sectionId
// Stored in SQLite so inference can run fully offline
// ─────────────────────────────────────────────────────────────────

export interface CachedStudent {
  studentId: string;
  sectionId: string;
  rollNumber: number;
  firstName: string;
  lastName: string;
  faceStatus: string;
  // Array of 512-dim MobileFaceNet embeddings (multiple per student from onboarding)
  embeddingVectors: Array<{
    id: string;
    embedding: number[];      // 512-dim
    modelVersion: string | null;
  }>;
  cachedAt: string;           // ISO timestamp of last sync
}
