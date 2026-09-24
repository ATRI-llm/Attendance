import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "@/src/store/auth.store";

export default function ProtectedLayout() {
  const { hydrated, isAuthenticated } = useAuthStore();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F4F7FB]">
        <ActivityIndicator size="large" color="#4338CA" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
