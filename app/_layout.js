import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#F7F4EC" },
          headerTintColor: "#17231D",
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: "#F7F4EC" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Kaha" }} />
        <Stack.Screen name="scanner" options={{ title: "Invoice Scanner" }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
