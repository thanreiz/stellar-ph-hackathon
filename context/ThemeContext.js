import React, { createContext, useContext, useState } from "react";

const LightColors = {
  background: "#FCFDF9",
  card: "#FFFFFF",
  cardSecondary: "#F3F4F0",
  text: "#191C1A",
  textSecondary: "#3F4940",
  primary: "#0D6F37",
  primaryContainer: "#96EFA9",
  onPrimaryContainer: "#00210b",
  secondary: "#53634F",
  tertiary: "#2563EB",
  error: "#DC2626",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#93000a",
  border: "#BFCABD",
  shadow: "rgba(13, 111, 55, 0.08)",
  mintContainer: "#A6F8B4",
  statusDefault: "#918A7F",
};

const DarkColors = {
  background: "#111411",
  card: "#191C17",
  cardSecondary: "#222622",
  text: "#E2E3DF",
  textSecondary: "#A2ABA0",
  primary: "#8BE59A",
  primaryContainer: "#0D6F37",
  onPrimaryContainer: "#96EFA9",
  secondary: "#BACCB3",
  tertiary: "#60A5FA",
  error: "#FF3B30",
  errorContainer: "#410002",
  onErrorContainer: "#FFDAD6",
  border: "#3F4940",
  shadow: "rgba(0, 0, 0, 0.3)",
  mintContainer: "#005226",
  statusDefault: "#5C635B",
};

const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  colors: LightColors,
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  const colors = theme === "light" ? LightColors : DarkColors;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
