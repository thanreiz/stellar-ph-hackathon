import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAppContext, THEMES } from "../context/AppContext";

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
      newErrors.storeName = "Kailangan ang pangalan ng tindahan.";
    }
    if (!location.trim()) {
      newErrors.location = "Kailangan ang lokasyon o barangay.";
    }
    if (!monthlyEarnings.trim() || isNaN(Number(monthlyEarnings.replace(/,/g, "")))) {
      newErrors.monthlyEarnings = "Kailangan ng wastong buwanang kita.";
    }
    
    // Validate Stellar Public Key format
    const cleanKey = publicKey.trim();
    const stellarPubKeyRegex = /^G[A-Z2-7]{55}$/;
    if (!cleanKey) {
      newErrors.publicKey = "Kailangan ang iyong Freighter/Stellar Public Key.";
    } else if (!stellarPubKeyRegex.test(cleanKey)) {
      newErrors.publicKey = "Hindi wasto ang Stellar Public Key (Dapat nagsisimula sa 'G', at may 56 na karakter).";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLevelSelect = async (level) => {
    await setUserLevel(level);
  };

  const handleOnboard = async () => {
    if (!validate()) {
      Alert.alert("Error", "Pakiayos ang mga mali sa ibaba bago magpatuloy.");
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
      Alert.alert("Error", "Hindi ma-save ang onboarding details. Subukan muli.");
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
          <Text style={[styles.emoji, { color: colors.primary }]}>🏪</Text>
          <Text style={[styles.title, { color: colors.text }]}>SariSync (Kaha)</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            B2B Settlement & Credit Ladder para sa iyong Sari-Sari Store
          </Text>
        </View>

        {/* Section 1: Store Profile */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>1. Impormasyon ng Tindahan</Text>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Pangalan ng Tindahan</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: errors.storeName ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="Hal. Ethan's Sari-Sari Store"
              placeholderTextColor={colors.theme === "dark" ? "#64748B" : "#94A3B8"}
              value={storeName}
              onChangeText={setStoreName}
            />
            {errors.storeName && <Text style={[styles.errorText, { color: colors.error }]}>{errors.storeName}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Lokasyon / Barangay</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: errors.location ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="Hal. Brgy. 76, Pasay City"
              placeholderTextColor={colors.theme === "dark" ? "#64748B" : "#94A3B8"}
              value={location}
              onChangeText={setLocation}
            />
            {errors.location && <Text style={[styles.errorText, { color: colors.error }]}>{errors.location}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Buwanang Kita (₱ PHP)</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: errors.monthlyEarnings ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="Hal. 25000"
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

        {/* Section 2: Choose Store Level & Theme */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>2. Piliin ang iyong Level at Tema</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Ang antas o level ay nagtatakda ng iyong limitasyon sa pautang at kulay ng app. Subukan silang pindutin upang makita ang pagbabago ng tema!
          </Text>

          <View style={styles.levelContainer}>
            {[1, 2, 3, 4, 5].map((lvl) => {
              const themeInfo = THEMES[lvl];
              const isSelected = userLevel === lvl;
              const lvlNames = {
                1: "Level 1: Teal",
                2: "Level 2: Orange",
                3: "Level 3: Blue",
                4: "Level 4: Purple",
                5: "Level 5: Dark",
              };
              
              return (
                <Pressable
                  key={lvl}
                  onPress={() => handleLevelSelect(lvl)}
                  style={[
                    styles.levelPill,
                    {
                      backgroundColor: isSelected ? themeInfo.colors.primary : themeInfo.colors.cardSecondary,
                      borderColor: themeInfo.colors.border,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.levelPillText,
                      {
                        color: isSelected
                          ? themeInfo.colors.buttonTextOnPrimary
                          : themeInfo.colors.text,
                        fontWeight: isSelected ? "800" : "500",
                      },
                    ]}
                  >
                    {lvlNames[lvl]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Section 3: Stellar Wallet Gate */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>3. Freighter Wallet Connection Gate</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Ipasok ang iyong Stellar Public Key para sa settlement at on-chain verification ng iyong Tiwala Score.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Stellar Public Key</Text>
            <TextInput
              style={[
                styles.input,
                styles.codeFont,
                { borderColor: errors.publicKey ? colors.error : colors.border, color: colors.text, backgroundColor: colors.surfaceLowest }
              ]}
              placeholder="G..."
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
        <Pressable
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
            Suriin at Mag-onboard
          </Text>
        </Pressable>
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
