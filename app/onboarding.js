import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAppContext, THEMES } from "../context/AppContext";
import { AnimatedPressable } from "../components/SariSyncUI";

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, userLevel, setUserLevel, colors } = useAppContext();

  // Form states
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState("");
  const [monthlyEarnings, setMonthlyEarnings] = useState("");
  const [publicKey, setPublicKey] = useState("");
  
  // Local validation state
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!storeName.trim()) {
      newErrors.storeName = "Store name is required.";
    }
    if (!location.trim()) {
      newErrors.location = "Location or barangay is required.";
    }
    if (!monthlyEarnings.trim() || isNaN(Number(monthlyEarnings.replace(/,/g, "")))) {
      newErrors.monthlyEarnings = "Valid monthly earnings is required.";
    }
    
    // Validate the Freighter wallet address without surfacing blockchain jargon.
    const cleanKey = publicKey.trim();
    const stellarPubKeyRegex = /^G[A-Z2-7]{55}$/;
    if (!cleanKey) {
      newErrors.publicKey = "Your Freighter wallet address is required.";
    } else if (!stellarPubKeyRegex.test(cleanKey)) {
      newErrors.publicKey = "Enter a valid Freighter wallet address.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLevelSelect = async (level) => {
    await setUserLevel(level);
  };

  const handleOnboard = async () => {
    if (!validate()) {
      Alert.alert("Error", "Please fix the errors below before continuing.");
      return;
    }

    try {
      const details = {
        storeName: storeName.trim(),
        location: location.trim(),
        monthlyEarnings: Number(monthlyEarnings.replace(/,/g, "")),
        level: userLevel,
        publicKey: publicKey.trim(),
      };

      await completeOnboarding(details);
      router.replace("/");
    } catch (error) {
      Alert.alert("Error", "Could not save onboarding details. Please try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require("../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.title, { color: colors.text }]}>SariSync</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Kaha, utang, and proof for your sari-sari store. Your records are secured in the background.
          </Text>
        </View>

        {/* Section 1: Store Profile */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Store Profile</Text>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Store Name</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: errors.storeName ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="e.g. Ethan's Sari-Sari Store"
              placeholderTextColor={colors.theme === "dark" ? "#64748B" : "#94A3B8"}
              value={storeName}
              onChangeText={setStoreName}
            />
            {errors.storeName && <Text style={[styles.errorText, { color: colors.error }]}>{errors.storeName}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Location / Barangay</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: errors.location ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="e.g. Brgy. 76, Pasay City"
              placeholderTextColor={colors.theme === "dark" ? "#64748B" : "#94A3B8"}
              value={location}
              onChangeText={setLocation}
            />
            {errors.location && <Text style={[styles.errorText, { color: colors.error }]}>{errors.location}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Monthly Earnings (₱ PHP)</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: errors.monthlyEarnings ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="e.g. 25000"
              placeholderTextColor={colors.theme === "dark" ? "#64748B" : "#94A3B8"}
              keyboardType="numeric"
              value={monthlyEarnings}
              onChangeText={setMonthlyEarnings}
            />
            {errors.monthlyEarnings && (
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.monthlyEarnings}</Text>
            )}
          </View>
        </View>

        {/* Section 3: Wallet Gate */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Connect Wallet</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Connect your Freighter wallet so payments and proof can be verified when you need them.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Wallet Address</Text>
            <TextInput
              style={[
                styles.input,
                styles.codeFont,
                { borderColor: errors.publicKey ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="Paste your Freighter wallet address"
              placeholderTextColor={colors.theme === "dark" ? "#64748B" : "#94A3B8"}
              autoCapitalize="characters"
              autoCorrect={false}
              value={publicKey}
              onChangeText={setPublicKey}
            />
            {errors.publicKey && <Text style={[styles.errorText, { color: colors.error }]}>{errors.publicKey}</Text>}
          </View>
        </View>

        {/* Submit button */}
        <AnimatedPressable
          onPress={handleOnboard}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[styles.submitButtonText, { color: colors.buttonTextOnPrimary }]}>
            Save and Complete Onboarding
          </Text>
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 20,
  },
  header: {
    alignItems: "center",
    marginVertical: 10,
    gap: 6,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 8,
  },
  emoji: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  codeFont: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
  },
  levelContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  levelPill: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 99,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  levelPillText: {
    fontSize: 13,
  },
  submitButton: {
    height: 56,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "800",
  },
});
