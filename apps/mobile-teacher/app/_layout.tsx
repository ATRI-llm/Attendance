import "../global.css";

import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

import { initLocalDb } from "@/src/db/localDb";
import { syncOfflineAttendance, syncOfflineMeals } from "@/src/services/syncManager.service";
import { useAuthStore } from "@/src/store/auth.store";

export default function RootLayout() {
  const wasOfflineRef = useRef(false);
  const { token, hydrate } = useAuthStore();

  useEffect(() => {
    void initLocalDb().catch((err) => console.error("[Layout] Local DB init failed:", err));
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;

      if (!connected) {
        wasOfflineRef.current = true;
        return;
      }

      if (wasOfflineRef.current && token) {
        wasOfflineRef.current = false;
        void syncOfflineAttendance(token).catch((err) =>
          console.warn("[Layout] Attendance auto-sync failed:", err?.message || err)
        );
        void syncOfflineMeals(token).catch((err) =>
          console.warn("[Layout] Meal auto-sync failed:", err?.message || err)
        );
      }
    });

    return unsubscribe;
  }, [token]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </SafeAreaProvider>
  );
}
