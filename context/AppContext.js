import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Define the 5 color theme palettes matching GoTyme's premium Web2 fintech aesthetic.
export const THEMES = {
  // Level 1: Teal (Fresh, organic, clean fintech theme)
  1: {
    theme: "light",
    colors: {
      background: "#FFF8EA",
      card: "#FFFFFF",
      cardSecondary: "#F5EEDF",
      surfacePaper: "#FFFAF0",
      surfaceMuted: "#F5EEDF",
      surfaceLow: "#F5EEDF",
      surfaceLowest: "#FFFAF0",
      text: "#18231F",
      textSecondary: "#617067",
      primary: "#136348",
      primaryContainer: "#DCEFE6",
      onPrimaryContainer: "#123A2C",
      secondary: "#52645A",
      tertiary: "#2F6F9F",
      expense: "#D97706",
      offline: "#D94B4B",
      success: "#18794E",
      error: "#B91C1C",
      errorContainer: "#FEE2E2",
      onErrorContainer: "#7F1D1D",
      proofBackground: "#EFFAF4",
      buttonTextOnPrimary: "#FFFFFF",
      border: "#DED3BD",
      shadow: "rgba(74, 51, 25, 0.10)",
      mintContainer: "#DCEFE6",
      statusDefault: "#6B7280",
    }
  },
  // Level 2: Orange (High contrast, modern premium look)
  2: {
    theme: "light",
    colors: {
      background: "#FFFBF7",
      card: "#FFFFFF",
      cardSecondary: "#FDF2E9",
      surfaceLow: "#FAEAE1",
      surfaceLowest: "#FFFFFF",
      text: "#201A15",
      textSecondary: "#5A4B40",
      primary: "#D95400",
      primaryContainer: "#FFDBCB",
      onPrimaryContainer: "#2F0D00",
      secondary: "#6F5D54",
      tertiary: "#0284C7",
      expense: "#EA580C",
      success: "#15803D",
      error: "#B91C1C",
      errorContainer: "#FEE2E2",
      onErrorContainer: "#7F1D1D",
      proofBackground: "#FFF6F0",
      buttonTextOnPrimary: "#FFFFFF",
      border: "#E6D0C4",
      shadow: "rgba(217, 84, 0, 0.08)",
      mintContainer: "#FFDBCB",
      statusDefault: "#6B7280",
    }
  },
  // Level 3: GoTyme Blue (Authentic GoTyme branding feel)
  3: {
    theme: "light",
    colors: {
      background: "#F6F8FC",
      card: "#FFFFFF",
      cardSecondary: "#EBF1FA",
      surfaceLow: "#E1EBF5",
      surfaceLowest: "#FFFFFF",
      text: "#0F172A",
      textSecondary: "#475569",
      primary: "#1E40AF",
      primaryContainer: "#DBEAFE",
      onPrimaryContainer: "#1E3A8A",
      secondary: "#475569",
      tertiary: "#0D9488",
      expense: "#EA580C",
      success: "#16A34A",
      error: "#DC2626",
      errorContainer: "#FEE2E2",
      onErrorContainer: "#7F1D1D",
      proofBackground: "#EFF6FF",
      buttonTextOnPrimary: "#FFFFFF",
      border: "#CBD5E1",
      shadow: "rgba(30, 64, 175, 0.08)",
      mintContainer: "#DBEAFE",
      statusDefault: "#64748B",
    }
  },
  // Level 4: Purple (Vibrant regal purple)
  4: {
    theme: "light",
    colors: {
      background: "#FAF8FC",
      card: "#FFFFFF",
      cardSecondary: "#F3EEFA",
      surfaceLow: "#ECE4F5",
      surfaceLowest: "#FFFFFF",
      text: "#1A0F2B",
      textSecondary: "#524566",
      primary: "#6D28D9",
      primaryContainer: "#EDE9FE",
      onPrimaryContainer: "#4C1D95",
      secondary: "#5C527F",
      tertiary: "#0D9488",
      expense: "#EAB308",
      success: "#16A34A",
      error: "#DC2626",
      errorContainer: "#FEE2E2",
      onErrorContainer: "#7F1D1D",
      proofBackground: "#F5F3FF",
      buttonTextOnPrimary: "#FFFFFF",
      border: "#D1C7E0",
      shadow: "rgba(109, 40, 217, 0.08)",
      mintContainer: "#EDE9FE",
      statusDefault: "#71717A",
    }
  },
  // Level 5: Maribank Dark Mode (Ultra premium dark charcoal and steel navy theme)
  5: {
    theme: "dark",
    colors: {
      background: "#0B0F19",
      card: "#151B2C",
      cardSecondary: "#1E2538",
      surfaceLow: "#1F293D",
      surfaceLowest: "#0B0E14",
      text: "#F8FAFC",
      textSecondary: "#94A3B8",
      primary: "#38BDF8",
      primaryContainer: "#0369A1",
      onPrimaryContainer: "#E0F2FE",
      secondary: "#64748B",
      tertiary: "#34D399",
      expense: "#F59E0B",
      success: "#10B981",
      error: "#EF4444",
      errorContainer: "#7F1D1D",
      onErrorContainer: "#FEE2E2",
      proofBackground: "#1E293B",
      buttonTextOnPrimary: "#0F172A",
      border: "#334155",
      shadow: "rgba(0, 0, 0, 0.5)",
      mintContainer: "#0369A1",
      statusDefault: "#475569",
    }
  }
};

const CHOICE_A_DARK_THEME = {
  theme: "dark",
  colors: {
    background: "#071410",
    card: "#10231D",
    cardSecondary: "#183128",
    surfacePaper: "#10231D",
    surfaceMuted: "#183128",
    surfaceLow: "#183128",
    surfaceLowest: "#0B1C17",
    text: "#F4F1E8",
    textSecondary: "#B8C8BC",
    primary: "#85D8AE",
    primaryContainer: "#163F2D",
    onPrimaryContainer: "#D7F8E3",
    secondary: "#A6B9AE",
    tertiary: "#80D8FF",
    expense: "#F5A142",
    offline: "#F06A6A",
    success: "#85D8AE",
    error: "#F87171",
    errorContainer: "#4C1D1D",
    onErrorContainer: "#FEE2E2",
    proofBackground: "#10251B",
    buttonTextOnPrimary: "#082014",
    border: "#2D4B3D",
    shadow: "rgba(0, 0, 0, 0.5)",
    mintContainer: "#123D2A",
    statusDefault: "#94A3B8",
  },
};

const AppContext = createContext({
  hasCompletedOnboarding: false,
  onboardingDetails: null,
  userLevel: 1,
  theme: "light",
  colors: THEMES[1].colors,
  isLoading: true,
  setUserLevel: async () => {},
  completeOnboarding: async () => {},
  clearOnboarding: async () => {},
});

export function AppProvider({ children }) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [onboardingDetails, setOnboardingDetails] = useState(null);
  const [userLevel, setUserLevelState] = useState(1);
  const [themeMode, setThemeMode] = useState("light");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const completed = await AsyncStorage.getItem("sarisync:hasCompletedOnboarding");
        const detailsRaw = await AsyncStorage.getItem("sarisync:onboardingDetails");
        const savedLevel = await AsyncStorage.getItem("sarisync:userLevel");
        const savedThemeMode = await AsyncStorage.getItem("sarisync:themeMode");

        if (completed === "true") {
          setHasCompletedOnboarding(true);
        }

        if (detailsRaw) {
          const parsedDetails = JSON.parse(detailsRaw);
          setOnboardingDetails(parsedDetails);
          if (parsedDetails.level) {
            setUserLevelState(Number(parsedDetails.level));
          }
        } else if (savedLevel) {
          setUserLevelState(Number(savedLevel));
        }

        if (savedThemeMode === "dark" || savedThemeMode === "light") {
          setThemeMode(savedThemeMode);
        }
      } catch (error) {
        console.error("[AppContext] Failed to load onboarding state", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadInitialData();
  }, []);

  async function setUserLevel(level) {
    const numericLevel = Number(level);
    if (numericLevel < 1 || numericLevel > 5) return;
    setUserLevelState(numericLevel);
    try {
      await AsyncStorage.setItem("sarisync:userLevel", String(numericLevel));
      if (onboardingDetails) {
        const updatedDetails = { ...onboardingDetails, level: numericLevel };
        setOnboardingDetails(updatedDetails);
        await AsyncStorage.setItem("sarisync:onboardingDetails", JSON.stringify(updatedDetails));
      }
    } catch (e) {
      console.error("[AppContext] Failed to save level", e);
    }
  }

  async function completeOnboarding(details) {
    try {
      await AsyncStorage.setItem("sarisync:hasCompletedOnboarding", "true");
      await AsyncStorage.setItem("sarisync:onboardingDetails", JSON.stringify(details));
      await AsyncStorage.setItem("sarisync:userLevel", String(details.level));
      
      // Also automatically save the connected Freighter/Stellar wallet connection to storage Service
      const walletConnection = {
        walletName: "Freighter Gate",
        publicKey: details.publicKey.trim(),
        network: "TESTNET",
        connectedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem("sarisync:walletConnection", JSON.stringify(walletConnection));

      setHasCompletedOnboarding(true);
      setOnboardingDetails(details);
      setUserLevelState(Number(details.level));
    } catch (error) {
      console.error("[AppContext] Failed to save onboarding details", error);
      throw error;
    }
  }

  async function clearOnboarding() {
    try {
      await AsyncStorage.multiRemove([
        "sarisync:hasCompletedOnboarding",
        "sarisync:onboardingDetails",
        "sarisync:userLevel",
        "sarisync:walletConnection"
      ]);
      setHasCompletedOnboarding(false);
      setOnboardingDetails(null);
      setUserLevelState(1);
    } catch (e) {
      console.error("[AppContext] Failed to clear onboarding", e);
    }
  }

  const activeTheme = themeMode === "dark" ? CHOICE_A_DARK_THEME : THEMES[1];

  async function cycleTheme() {
    const nextMode = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextMode);
    try {
      await AsyncStorage.setItem("sarisync:themeMode", nextMode);
    } catch (e) {
      console.error("[AppContext] Failed to save theme mode", e);
    }
  }

  return (
    <AppContext.Provider
      value={{
        hasCompletedOnboarding,
        onboardingDetails,
        userLevel,
        theme: activeTheme.theme,
        colors: activeTheme.colors,
        isLoading,
        setUserLevel,
        completeOnboarding,
        clearOnboarding,
        toggleTheme: cycleTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
