import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { uploadFaceImages } from "@/src/services/faceOnboarding.service";

export default function FaceCaptureScreen() {
  const { studentId, studentName } = useLocalSearchParams<{ studentId: string; studentName?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { void requestPermission(); }, []);

  const captureImage = async () => {
    if (!cameraRef.current || images.length >= 10 || uploading) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (photo?.uri) setImages((prev) => [...prev, photo.uri]);
  };

  const submitImages = async () => {
    if (images.length < 3) {
      Alert.alert("More photos required", "Capture at least 3 clear face photos from slightly different angles.");
      return;
    }

    try {
      setUploading(true);
      const permissionResult = await Location.requestForegroundPermissionsAsync();
      if (permissionResult.status !== "granted") throw new Error("Location permission is required for face onboarding.");
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

      const formData = new FormData();
      formData.append("studentId", String(studentId));
      formData.append("latitude", String(location.coords.latitude));
      formData.append("longitude", String(location.coords.longitude));

      images.forEach((uri, index) => {
        formData.append("images", { uri, name: `face-${Date.now()}-${index}.jpg`, type: "image/jpeg" } as any);
      });

      await uploadFaceImages(formData);
      Alert.alert("Submitted", "Face images were uploaded. Wait for the backend ML job to mark the student ADDED.");
      router.back();
    } catch (error: any) {
      Alert.alert("Upload failed", error?.response?.data?.message || error?.message || "Could not upload face images.");
    } finally {
      setUploading(false);
    }
  };

  if (!permission?.granted) return <View className="flex-1 items-center justify-center bg-black"><Text className="text-white">Camera permission is required.</Text></View>;

  return <SafeAreaView className="flex-1 bg-[#F4F7FB]">
    <View className="px-5 pt-4 pb-4 flex-row items-center justify-between">
      <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Ionicons name="arrow-back" size={20} color="#0F172A" /></TouchableOpacity>
      <Text className="text-lg font-bold text-[#0F172A]" numberOfLines={1}>{studentName || "Face Onboarding"}</Text>
      <View className="w-10" />
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View className="overflow-hidden rounded-3xl bg-black"><CameraView ref={cameraRef} style={{ height: 460 }} facing={"back" as CameraType} /></View>
      <Text className="mt-5 text-center text-sm font-semibold text-[#475569]">Capture 3–10 clear photos with the full face visible.</Text>
      <ScrollView horizontal className="mt-5" showsHorizontalScrollIndicator={false}>
        {images.map((uri, i) => <View key={`${uri}-${i}`} className="mr-3"><Image source={{ uri }} className="h-24 w-24 rounded-2xl" /><TouchableOpacity onPress={() => setImages((p) => p.filter((_, x) => x !== i))} className="absolute -right-2 -top-2 h-7 w-7 rounded-full bg-red-500 items-center justify-center"><Ionicons name="close" size={14} color="white" /></TouchableOpacity></View>)}
      </ScrollView>
      <View className="mt-8 flex-row justify-between items-center">
        <TouchableOpacity disabled={uploading || images.length >= 10} onPress={captureImage} className="h-20 w-20 rounded-full border-4 border-gray-300 bg-white items-center justify-center"><View className="h-16 w-16 rounded-full bg-gray-50" /></TouchableOpacity>
        <TouchableOpacity disabled={uploading || images.length < 3} onPress={submitImages} className={`rounded-2xl px-6 py-4 ${images.length >= 3 ? "bg-[#4338CA]" : "bg-gray-300"}`}>
          {uploading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Upload {images.length} Photos</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
