import axios from "axios";
import { getPendingSyncSessions, getSessionRecords, updateSessionStatus } from "../db/offlineAttendance";
import { getPendingMealSyncSessions, updateMealSessionStatus } from "../db/offlineMeal";
import { OfflineSyncPayload } from "../types/attendance.types";
import * as FileSystem from "expo-file-system/legacy";
import { API_URL } from "../lib/api";

export const syncOfflineMeals = async (token: string): Promise<void> => {
  const pendingSessions = await getPendingMealSyncSessions();
  if (!pendingSessions.length) return;

  let lastError: unknown;
  for (const session of pendingSessions) {
    try {
      await updateMealSessionStatus(session.id, "SYNCING");
      const response = await axios.post(
        `${API_URL}/meal/offline-sync`,
        {
          sectionId: session.sectionId,
          date: session.date,
          deviceId: session.deviceId,
          detectorVersion: session.detectorVersion,
          totalDetected: session.totalDetected,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      );

      if (!response.data?.success) throw new Error(response.data?.message || "Meal sync failed");
      await updateMealSessionStatus(session.id, "SYNCED", response.data.data.sessionId);
    } catch (error: any) {
      lastError = error;
      await updateMealSessionStatus(session.id, "SYNC_FAILED");
    }
  }

  if (lastError) throw lastError;
};

export const syncOfflineAttendance = async (token: string): Promise<void> => {
  const pendingSessions = await getPendingSyncSessions();
  if (!pendingSessions.length) return;

  let lastError: unknown;
  for (const session of pendingSessions) {
    try {
      await updateSessionStatus(session.id, "SYNCING");
      const records = await getSessionRecords(session.id);

      const syncRecords = await Promise.all(
        records.map(async (record) => {
          let cropImageBase64: string | undefined;
          if (record.cropImagePath) {
            try {
              cropImageBase64 = await FileSystem.readAsStringAsync(record.cropImagePath, {
                encoding: "base64" as any,
              });
            } catch (error) {
              console.warn("[SyncManager] Crop read failed:", record.cropImagePath, error);
            }
          }

          return {
            studentId: record.studentId,
            rollNumber: record.rollNumber,
            status: record.status,
            confidence: record.confidence,
            cropImageBase64,
            embeddingVector: record.embeddingVector,
            capturedAt: record.capturedAt,
          };
        })
      );

      const payload: OfflineSyncPayload = {
        sectionId: session.sectionId,
        date: session.date,
        deviceId: session.deviceId,
        backboneVersion: session.backboneVersion,
        classifierVersion: session.classifierVersion,
        records: syncRecords,
      };

      const response = await axios.post(`${API_URL}/attendance/offline-sync`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000,
      });

      if (!response.data?.success) throw new Error(response.data?.message || "Attendance sync failed");

      await updateSessionStatus(session.id, "SYNCED", {
        syncedAt: new Date().toISOString(),
        serverSessionId: response.data.data.sessionId,
      });
    } catch (error: any) {
      lastError = error;
      await updateSessionStatus(session.id, "SYNC_FAILED");
    }
  }

  if (lastError) throw lastError;
};
