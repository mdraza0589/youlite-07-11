// src/screens/MobileRegistrationScreen.tsx
import React, { useState, useEffect } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import Colors from "@/utils/Colors";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { app } from "../../utils/firebaseConfig"; // ✅ only Firebase core

// ✅ Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const MobileRegistrationScreen: React.FC = () => {
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // ✅ Native push registration (works for Android/iOS)
  const registerForPushNotificationsAsync = async () => {
    try {
      if (!Device.isDevice) {
        console.log("Push notifications: must use a physical device");
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Notification permission not granted!");
        return;
      }

      const pushTokenData = await Notifications.getDevicePushTokenAsync();
      console.log("Device Push Token (FCM/APNs):", pushTokenData.data);

      const expoToken = (
        await Notifications.getExpoPushTokenAsync({
          projectId: "80955700657",
        })
      ).data;
      console.log("Expo Push Token:", expoToken);
    } catch (error) {
      console.log("Error registering for push notifications:", error);
    }
  };

  const handleSkip = () => router.replace("/(tabs)");

  const handleSendOTP = async () => {
    if (!mobile) return Alert.alert("Error", "Please enter your mobile number");

    // ❌ Email no longer mandatory
    // if (!email) return Alert.alert("Error", "Please enter your email address");

    // ❌ Commenting out email format check since it's optional
    // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // if (email && !emailRegex.test(email)) {
    //   return Alert.alert("Error", "Please enter a valid email address");
    // }

    // ❌ Password not required now
    // if (password.length < 6) {
    //   return Alert.alert("Error", "Password must be at least 6 characters long");
    // }

    const cleanMobile = mobile.replace(/[^0-9]/g, "");
    if (cleanMobile.length !== 10) {
      return Alert.alert("Error", "Please enter a valid 10-digit mobile number");
    }

    setIsLoading(true);
    try {
      const response = await fetch("https://youlitestore.in/wp-json/mobile-app/v1/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ mobile: cleanMobile, email }), // email still sent if provided
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Invalid server response: ${text}`);
      }

      const data = await response.json();
      if (data.success) {
        router.push({
          pathname: "/Login/VerifyOTPScreen",
          params: { mobile: cleanMobile, email, password },
        });
      } else {
        Alert.alert("Error", data.message || "Failed to send OTP");
      }
    } catch (error: any) {
      let msg = "Something went wrong";
      if (error.message.includes("Network request failed"))
        msg = "Network error. Please check your internet connection";
      else if (error.message.includes("405")) msg = "Server configuration error";
      else if (error.message) msg = error.message;
      Alert.alert("Error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMobileNumber = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setMobile(cleaned.slice(0, 10));
  };

  // ✅ Adjusted to only require mobile number
  const canSubmit = mobile.length === 10; // && email && password.length >= 6;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }} // ✅ ensure full height
      >
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.scrollContainer} style={{ flex: 1 }}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="phone-portrait-outline" size={80} color={Colors.PRIMARY} />
              </View>
              <Text style={styles.title}>Mobile Verification</Text>
              <Text style={styles.subtitle}>Enter your mobile number and create account</Text>
            </View>

            <View style={styles.formContainer}>
              {/* ✅ Mobile Field */}
              <View style={styles.inputContainer}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <Ionicons name="call-outline" size={20} color={Colors.PRIMARY} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Mobile Number"
                  value={mobile}
                  onChangeText={formatMobileNumber}
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  maxLength={10}
                  autoFocus
                />
              </View>

              {/* ✅ Email (Optional) */}
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={Colors.PRIMARY} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address (Optional)"
                  value={email}
                  onChangeText={setEmail}
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>

              {/* ✅ Password (Optional) */}
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.PRIMARY} style={styles.inputIcon} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingRight: 60, alignItems: 'center' }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Password (Optional)"
                    value={password}
                    onChangeText={setPassword}
                    placeholderTextColor="#999"
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                  />
                  <TouchableOpacity
                    style={styles.visibilityToggle}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#999" />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.helperText}>
                We will send you a 6-digit OTP to verify your number
              </Text>

              <TouchableOpacity
                style={[styles.button, (!canSubmit || isLoading) && styles.buttonDisabled]}
                onPress={handleSendOTP}
                disabled={!canSubmit || isLoading}
              >
                <Text style={styles.buttonText}>
                  {isLoading ? "Sending..." : "Send OTP"}
                </Text>
              </TouchableOpacity>

              <View style={styles.infoContainer}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.PRIMARY} />
                <Text style={styles.infoText}>Your information is safe and secure</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <View style={styles.poweredBy}>
        <Text style={{ fontSize: 12 }}>Powered By </Text>
        <Text
          style={{ color: "blue", fontSize: 12 }}
          onPress={() => router.push("https://www.metawish.ai/")}
        >
          Metawish.AI
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.WHITE, flex: 1, paddingTop: 40 },
  skipButton: { position: "absolute", top: 80, right: 30, zIndex: 10, padding: 10 },
  skipButtonText: { color: Colors.PRIMARY, fontSize: 16, fontWeight: "600" },
  scrollContainer: {
    padding: 20,
    justifyContent: "center",
    paddingTop: Platform.OS === "ios" ? 70 : 50,
  },
  header: { alignItems: "center", marginBottom: 40 },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${Colors.PRIMARY}15`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: "bold", color: Colors.PRIMARY, marginBottom: 10 },
  subtitle: { fontSize: 16, color: "#666", textAlign: "center", paddingHorizontal: 20 },
  formContainer: { width: "100%" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.WHITE,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 15,
    paddingHorizontal: 15,
    height: 50,
  },
  countryCode: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: "#ddd",
    marginRight: 10,
  },
  countryCodeText: { fontSize: 16, color: Colors.BLACK, fontWeight: "600" },
  inputIcon: { marginRight: 10 },
  input: { height: "100%", color: Colors.BLACK, fontSize: 16, width: "100%" },
  visibilityToggle: { padding: 5 },
  helperText: { fontSize: 13, color: "#999", marginBottom: 20, textAlign: "center" },
  button: {
    backgroundColor: Colors.PRIMARY,
    borderRadius: 10,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.WHITE, fontSize: 16, fontWeight: "bold" },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  infoText: { fontSize: 13, color: "#666" },
  poweredBy: {
    flexDirection: "row",
    marginTop: 2,
    position: "absolute",
    right: 20,
    bottom: 30,
  },
});

export default MobileRegistrationScreen;
