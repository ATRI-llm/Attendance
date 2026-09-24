import * as FileSystem from "expo-file-system/legacy";
import axios from "axios";
import { API_URL, API_ORIGIN, toMobileUrl } from "../lib/api";
import { getActiveModelAsset, saveModelAsset } from "../db/modelAsset";
import { cacheSectionStudents, getCachedStudents } from "../db/sectionStudentCache";
import { useAttendanceStore } from "../store/attendance.store";
import { mobileFaceNet } from "../ml/mobilefacenet";
import { studentClassifier } from "../ml/classifier";
import { CachedStudent } from "../types/model.types";

const MODELS_DIR = `${FileSystem.documentDirectory}models/`;
const MIN_MODEL_BYTES = 10 * 1024;

const ensureModelsDir = async () => {
  const info = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  }
};

const isUsableFile = async (path: string): Promise<boolean> => {
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists === true && (info.size ?? 0) >= MIN_MODEL_BYTES;
  } catch {
    return false;
  }
};

const downloadRequired = async (url: string, destination: string): Promise<void> => {
  const finalUrl = toMobileUrl(url);
  const result = await FileSystem.downloadAsync(finalUrl, destination);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Model download failed (${result.status}): ${finalUrl}`);
  }
  if (!(await isUsableFile(destination))) {
    throw new Error(`Downloaded model is missing/too small: ${destination}`);
  }
};

const downloadDetector = async (destination: string): Promise<void> => {
  const candidates = [
    `${API_ORIGIN}/models/det_500m.onnx`,
    `${API_ORIGIN}/models/Det_Retina_Net.onnx`,
    `${API_ORIGIN}/uploads/models/Det_Retina_Net.onnx`,
  ];

  let lastError: unknown;
  for (const url of candidates) {
    try {
      await downloadRequired(url, destination);
      return;
    } catch (error) {
      lastError = error;
      console.warn("[ModelSync] Detector candidate failed:", url, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not download the face detector model.");
};

export const syncModelAssets = async (sectionId: string, token: string): Promise<void> => {
  await ensureModelsDir();

  const localAsset = await getActiveModelAsset(sectionId);
  if (localAsset) {
    const detectorPath = `${MODELS_DIR}detector.onnx`;
    if (
      (await isUsableFile(localAsset.backbonePath)) &&
      (await isUsableFile(localAsset.classifierPath)) &&
      (await isUsableFile(detectorPath))
    ) {
      await loadModelsIntoMemory(localAsset.backbonePath, localAsset.classifierPath, localAsset.classifierVersion);
      useAttendanceStore.getState().setActiveModel(localAsset);
      return;
    }
  }

  const res = await axios.get(`${API_URL}/model-sync/assets/${sectionId}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  });

  const serverAsset = res.data?.data;
  if (!serverAsset) {
    console.warn("[ModelSync] No active model is registered for this section.");
    return;
  }

  const bbPath = `${MODELS_DIR}bb_${serverAsset.backboneVersion}.onnx`;
  const clfPath = `${MODELS_DIR}clf_${serverAsset.classifierVersion}.onnx`;
  const detectorPath = `${MODELS_DIR}detector.onnx`;

  await downloadRequired(serverAsset.backboneUrl, bbPath);
  await downloadRequired(serverAsset.classifierUrl, clfPath);
  await downloadDetector(detectorPath);

  const newLocalAsset = await saveModelAsset({
    backboneVersion: serverAsset.backboneVersion,
    classifierVersion: serverAsset.classifierVersion,
    sectionId,
    backbonePath: bbPath,
    classifierPath: clfPath,
  });

  await loadModelsIntoMemory(bbPath, clfPath, serverAsset.classifierVersion);
  useAttendanceStore.getState().setActiveModel(newLocalAsset);
};

export const syncStudentEmbeddings = async (sectionId: string, token: string): Promise<void> => {
  try {
    const res = await axios.get(`${API_URL}/model-sync/embeddings/${sectionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    const students: CachedStudent[] = (res.data?.data?.students ?? []).map((s: any) => ({
      ...s,
      sectionId,
      embeddingVectors: s.embeddingVectors ?? [],
      cachedAt: new Date().toISOString(),
    }));

    if (students.length > 0) {
      await cacheSectionStudents(students);
      useAttendanceStore.getState().setSectionStudents(students);
      return;
    }

    throw new Error("No students with embeddings were returned.");
  } catch (error) {
    const localStudents = await getCachedStudents(sectionId);
    if (localStudents.length > 0) {
      useAttendanceStore.getState().setSectionStudents(localStudents);
      console.warn("[ModelSync] Using cached student embeddings.");
      return;
    }
    throw error;
  }
};

export const loadModelsIntoMemory = async (
  bbPath: string,
  clfPath: string,
  clfVersion: string
) => {
  await mobileFaceNet.loadModel(bbPath);
  await studentClassifier.loadModel(clfPath, clfVersion);
};
