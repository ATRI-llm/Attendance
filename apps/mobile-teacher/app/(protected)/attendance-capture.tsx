import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { getSectionCache, SectionCache } from "@/src/lib/sectionCache";
import { checkCurrentLocation } from "@/src/services/location.service";
import { startOfflineSession, processAttendancePhoto, finalizeOfflineSession } from "@/src/services/offlineAttendance.service";
import { useAttendanceStore } from "@/src/store/attendance.store";
import { useAuthStore } from "@/src/store/auth.store";
import { getActiveModelAsset } from "@/src/db/modelAsset";
import { getCachedStudents } from "@/src/db/sectionStudentCache";
import { loadModelsIntoMemory } from "@/src/services/modelSync.service";

export default function AttendanceCaptureScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [images, setImages] = useState<{ uri: string; base64: string }[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [sectionData, setSectionData] = useState<SectionCache | null>(null);
  const { token } = useAuthStore();
  const store = useAttendanceStore();

  useEffect(() => {
    void requestPermission();
    void prepareOfflineInference();
  }, []);

  const prepareOfflineInference = async () => {
    const data = await getSectionCache();
    setSectionData(data);
    if (!data) return;

    if (!store.sectionStudents.length) {
      const students = await getCachedStudents(data.sectionId);
      store.setSectionStudents(students);
    }

    if (!store.activeModel) {
      const asset = await getActiveModelAsset(data.sectionId);
      if (asset) {
        try {
          await loadModelsIntoMemory(asset.backbonePath, asset.classifierPath, asset.classifierVersion);
          store.setActiveModel(asset);
        } catch (error) {
          console.warn("[Attendance] Cached model failed to load:", error);
        }
      }
    }
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || images.length >= 10 || processing) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
    if (photo?.base64) setImages((prev) => [...prev, { uri: photo.uri, base64: photo.base64 }]);
  };

  const runLocalInference = async () => {
    if (!sectionData) return Alert.alert("Setup required", "Open Dashboard while online once so the section/model cache is created.");
    if (!images.length) return Alert.alert("No photos", "Capture at least one classroom photo.");
    if (!store.sectionStudents.length) return Alert.alert("No student cache", "No enrolled students with face embeddings are cached for this section.");

    try {
      setProcessing(true);
      setProgressText("Checking school location...");
      const location = await checkCurrentLocation(sectionData.schoolLatitude, sectionData.schoolLongitude, sectionData.geoRadius);
      if (!location.isInside) throw new Error(`You are ${Math.round(location.distance)} m outside the school geofence.`);

      const session = await startOfflineSession(sectionData.sectionId);
      setProgressText("Running local face recognition...");

      for (let i = 0; i < images.length; i++) {
        setProgressText(`Analyzing photo ${i + 1} of ${images.length}...`);
        await processAttendancePhoto(images[i].base64, setProgressText);
      }

      await finalizeOfflineSession();
      router.push({ pathname: "/(protected)/attendance-review", params: { sessionId: session.id } });
    } catch (error: any) {
      Alert.alert("Attendance failed", error?.message || "Local inference failed.");
    } finally {
      setProcessing(false);
      setProgressText("");
    }
  };

  if (!permission?.granted) {
    return <View className="flex-1 items-center justify-center bg-black"><Text className="text-white">Camera permission is required.</Text><TouchableOpacity onPress={() => requestPermission()}><Text className="mt-4 text-white underline">Grant permission</Text></TouchableOpacity></View>;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F4F7FB]">
      <View className="px-5 pt-4 pb-4 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Ionicons name="arrow-back" size={20} color="#0F172A" /></TouchableOpacity>
        <Text className="text-lg font-bold text-[#0F172A]">Attendance</Text>
        <Image source={require("../../assets/images/uitb-logo.jpg")} className="h-9 w-9 rounded-full" resizeMode="contain" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-4"><View className="overflow-hidden rounded-3xl bg-white border border-gray-200"><CameraView ref={cameraRef} style={{ height: 400 }} facing={"back" as CameraType} /></View></View>

        <View className="px-5 mt-8">
          <View className="flex-row items-center justify-between mb-4"><Text className="text-base font-bold text-[#0F172A]">Captured Photos</Text><Text className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{images.length} / 10</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {images.map((img, index) => <View key={`${img.uri}-${index}`} className="mr-4"><Image source={{ uri: img.uri }} className="h-24 w-24 rounded-2xl" /><TouchableOpacity onPress={() => setImages((p) => p.filter((_, i) => i !== index))} className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-red-500 items-center justify-center"><Ionicons name="close" size={14} color="white" /></TouchableOpacity></View>)}
          </ScrollView>

          <View className="mt-8 flex-row items-center justify-between px-6 pb-6">
            <View className="w-16" />
            <TouchableOpacity onPress={capturePhoto} disabled={processing} className="h-20 w-20 items-center justify-center rounded-full bg-white border-[6px] border-gray-200"><View className="h-[68px] w-[68px] rounded-full bg-white border border-gray-100" /></TouchableOpacity>
            <View className="w-16 items-end">{images.length > 0 && <TouchableOpacity disabled={processing} onPress={runLocalInference} className="h-16 w-16 items-center justify-center rounded-full bg-[#10B981]"><Ionicons name="checkmark-sharp" size={32} color="white" /></TouchableOpacity>}</View>
          </View>
          {processing && <View className="items-center"><ActivityIndicator color="#4338CA" /><Text className="mt-2 text-sm font-semibold text-[#64748B]">{progressText}</Text></View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
