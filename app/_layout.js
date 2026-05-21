import '../utils/polyfills';

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

function InnerLayout() {
  const { theme, colors } = useTheme();

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Kaha" }} />
        <Stack.Screen name="scanner" options={{ title: "Invoice Scanner" }} />
      </Stack>
      <StatusBar style={theme === "light" ? "dark" : "light"} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <InnerLayout />
    </ThemeProvider>
  );
}
