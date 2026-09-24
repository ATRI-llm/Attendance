import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Redirect } from "expo-router";
import Toast from "react-native-toast-message";

import { loginTeacher } from "../../src/services/auth.service";
import { useAuthStore } from "../../src/store/auth.store";

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth, hydrated, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Login screen is intentionally passive; protected layout handles auth routing.
  }, []);

  if (hydrated && isAuthenticated) {
    return <Redirect href="/(protected)/dashboard" />;
  }

  const handleLogin = async () => {
    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier || !password) {
      Toast.show({ type: "error", text1: "Missing fields", text2: "Enter your teacher ID/mobile and password." });
      return;
    }

    try {
      setLoading(true);
      const response = await loginTeacher(cleanIdentifier, password);
      await setAuth(response.token, response.user);
      Toast.show({ type: "success", text1: "Login successful" });
      router.replace("/(protected)/dashboard");
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Login failed",
        text2: error?.message || "Could not connect to the backend.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F4F7FB]">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
          <View className="items-center mb-10">
            <View className="h-28 w-28 overflow-hidden rounded-[2rem] border-4 border-white bg-white items-center justify-center">
              <Image source={require("../../assets/images/uitb-logo.jpg")} className="h-24 w-24" resizeMode="contain" />
            </View>
            <Text className="mt-6 text-[32px] font-extrabold text-[#0F172A]">Welcome Back</Text>
            <Text className="mt-2 text-base font-medium text-[#64748B]">Sign in to manage your classroom</Text>
          </View>

          <View className="rounded-3xl bg-white p-6 border border-gray-100">
            <Text className="mb-2 text-sm font-bold text-[#475569]">Teacher ID / Mobile</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Enter your ID or mobile"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              className="mb-5 h-14 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-base text-[#0F172A]"
            />

            <Text className="mb-2 text-sm font-bold text-[#475569]">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              className="mb-6 h-14 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-base text-[#0F172A]"
            />

            <TouchableOpacity disabled={loading} onPress={handleLogin} className="h-14 flex-row items-center justify-center rounded-2xl bg-[#4338CA]">
              {loading ? <ActivityIndicator color="white" /> : <Text className="text-lg font-bold text-white">Sign In</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
