import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { getOfflineSessionById, getSessionRecords, updateRecordStatus, reassignRecordToStudent } from "@/src/db/offlineAttendance";
import { getCachedStudents } from "@/src/db/sectionStudentCache";
import { syncOfflineAttendance } from "@/src/services/syncManager.service";
import { captureSingleStudentPhoto } from "@/src/services/offlineAttendance.service";
import { useAuthStore } from "@/src/store/auth.store";
import { OfflineAttendanceRecord, OfflineAttendanceSession } from "@/src/types/attendance.types";
import { StudentSelectModal, StudentListItem } from "@/src/components/StudentSelectModal";

export default function AttendanceReviewScreen() {
  const { sessionId, fromHistory } = useLocalSearchParams();
  const { token } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [session, setSession] = useState<OfflineAttendanceSession | null>(null);
  const [records, setRecords] = useState<OfflineAttendanceRecord[]>([]);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentSelectVisible, setStudentSelectVisible] = useState(false);
  const [recordToReassign, setRecordToReassign] = useState<OfflineAttendanceRecord | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [absentRecordToCapture, setAbsentRecordToCapture] = useState<OfflineAttendanceRecord | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const sess = await getOfflineSessionById(String(sessionId));
      const recs = await getSessionRecords(String(sessionId));
      setSession(sess);
      setRecords(recs);
      if (sess) {
        const cached = await getCachedStudents(sess.sectionId);
        setStudents(cached);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  const handleSync = async () => {
    if (!token) return Alert.alert("Login required", "Please log in again.");
    try {
      setSyncing(true);
      await syncOfflineAttendance(token);
      await loadData();
      Alert.alert("Saved", "Attendance was synchronized with the backend.");
    } catch (error: any) {
      Alert.alert("Sync failed", error?.response?.data?.message || error?.message || "Could not sync attendance.");
    } finally {
      setSyncing(false);
    }
  };

  const onStudentSelected = async (student: StudentListItem) => {
    if (!recordToReassign || !session) return;
    try {
      await reassignRecordToStudent(recordToReassign.id, session.id, student.studentId, student.rollNumber, `${student.firstName} ${student.lastName}`);
      setStudentSelectVisible(false);
      setRecordToReassign(null);
      await loadData();
    } catch (error) {
      Alert.alert("Correction failed", "Could not reassign the attendance record.");
    }
  };

  const toggleAbsent = async (record: OfflineAttendanceRecord) => {
    try {
      await updateRecordStatus(record.id, record.status === "ABSENT" ? "PRESENT" : "ABSENT");
      await loadData();
    } catch {
      Alert.alert("Update failed", "Could not update attendance status.");
    }
  };

  const capturePresent = async () => {
    if (!cameraRef.current || !absentRecordToCapture || !session) return;
    try {
      setCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo?.base64) throw new Error("Could not capture the image.");
      await captureSingleStudentPhoto(photo.base64, absentRecordToCapture.id, session.id, absentRecordToCapture.rollNumber);
      setCameraVisible(false);
      setAbsentRecordToCapture(null);
      await loadData();
    } catch (error: any) {
      Alert.alert("Capture failed", error?.message || "No face could be processed.");
    } finally {
      setCapturing(false);
    }
  };

  if (loading && !session) return <View className="flex-1 items-center justify-center bg-[#F4F7FB]"><ActivityIndicator size="large" color="#4338CA" /></View>;
  if (!session) return <View className="flex-1 bg-[#F4F7FB]" />;

  const enrolled = records.filter((r) => r.rollNumber !== -1);
  const present = enrolled.filter((r) => r.status === "PRESENT" || r.status === "MANUAL");
  const absent = enrolled.filter((r) => r.status === "ABSENT");
  const sorted = [...records].sort((a, b) => a.rollNumber - b.rollNumber);

  return (
    <SafeAreaView className="flex-1 bg-[#F4F7FB]">
      <View className="px-5 pt-4 pb-4 flex-row items-center justify-between"><TouchableOpacity onPress={() => router.replace("/(protected)/dashboard")} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Ionicons name="home" size={18} color="#0F172A" /></TouchableOpacity><Text className="text-lg font-bold text-[#0F172A]">Review Attendance</Text><View className="w-10" /></View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
        <View className="rounded-3xl bg-[#4338CA] px-5 py-4"><Text className="text-white font-bold">Local inference result</Text><Text className="text-indigo-200 text-xs mt-1">Review before synchronization</Text></View>
        <View className="mt-5 flex-row justify-between"><View className="w-[30%] rounded-3xl bg-white p-4 items-center"><Text className="text-3xl font-black">{enrolled.length}</Text><Text className="text-xs text-gray-500">Total</Text></View><View className="w-[30%] rounded-3xl bg-green-50 p-4 items-center"><Text className="text-3xl font-black text-green-600">{present.length}</Text><Text className="text-xs text-green-600">Present</Text></View><View className="w-[30%] rounded-3xl bg-red-50 p-4 items-center"><Text className="text-3xl font-black text-red-600">{absent.length}</Text><Text className="text-xs text-red-600">Absent</Text></View></View>

        {sorted.map((record) => {
          const unknown = record.rollNumber === -1;
          const isPresent = record.status === "PRESENT" || record.status === "MANUAL";
          return <View key={record.id} className={`mt-4 rounded-3xl border p-4 ${unknown ? "border-red-200 bg-red-50" : isPresent ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}>
            <View className="flex-row items-center">
              <TouchableOpacity onPress={() => { if (record.status === "ABSENT") { void requestPermission(); setAbsentRecordToCapture(record); setCameraVisible(true); } }} className="mr-4">
                {record.cropImagePath ? <Image source={{ uri: record.cropImagePath }} className="h-16 w-16 rounded-2xl" /> : <View className="h-16 w-16 rounded-2xl bg-gray-100 items-center justify-center"><Ionicons name="camera" size={24} color="#9CA3AF" /></View>}
              </TouchableOpacity>
              <View className="flex-1"><Text className="font-bold text-base text-[#0F172A]">{record.studentName}</Text>{!unknown && <Text className="text-xs text-gray-500 mt-1">Roll {record.rollNumber} · {Math.round(record.confidence * 100)}% confidence</Text>}<View className="flex-row mt-3 gap-2"><TouchableOpacity onPress={() => { setRecordToReassign(record); setStudentSelectVisible(true); }} className="rounded-full bg-white border border-gray-200 px-3 py-1.5"><Text className="text-xs font-bold text-indigo-700">{unknown ? "Assign" : "Edit"}</Text></TouchableOpacity>{!unknown && <TouchableOpacity onPress={() => void toggleAbsent(record)} className="rounded-full bg-white border border-gray-200 px-3 py-1.5"><Text className="text-xs font-bold text-gray-700">{record.status === "ABSENT" ? "Mark present" : "Mark absent"}</Text></TouchableOpacity>}</View></View>
            </View>
          </View>;
        })}

        {!fromHistory && <TouchableOpacity disabled={syncing} onPress={handleSync} className="mt-8 rounded-3xl bg-[#4338CA] py-5 items-center">{syncing ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Confirm & Save</Text>}</TouchableOpacity>}
        {session.status !== "SYNCED" && fromHistory && <TouchableOpacity disabled={syncing} onPress={handleSync} className="mt-8 rounded-3xl bg-[#10B981] py-5 items-center">{syncing ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">Sync Now</Text>}</TouchableOpacity>}
      </ScrollView>

      <StudentSelectModal visible={studentSelectVisible} students={students} onSelect={onStudentSelected} onClose={() => setStudentSelectVisible(false)} />
      <Modal visible={cameraVisible} animationType="slide"><View className="flex-1 bg-black"><View className="absolute top-0 z-10 w-full flex-row justify-between p-6 pt-12"><TouchableOpacity onPress={() => setCameraVisible(false)}><Ionicons name="close" size={28} color="white" /></TouchableOpacity><Text className="text-white font-semibold">Capture {absentRecordToCapture?.studentName}</Text><View className="w-7" /></View><CameraView ref={cameraRef} style={{ flex: 1 }} facing={"back" as CameraType} /><View className="absolute bottom-0 w-full items-center p-8 pb-12"><TouchableOpacity onPress={capturePresent} disabled={capturing} className="h-20 w-20 rounded-full border-4 border-white items-center justify-center">{capturing ? <ActivityIndicator color="white" /> : <View className="h-16 w-16 rounded-full bg-white" />}</TouchableOpacity></View></View></Modal>
    </SafeAreaView>
  );
}
