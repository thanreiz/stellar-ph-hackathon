import React from "react";
import { AppProvider, useAppContext } from "./AppContext";

export function ThemeProvider({ children }) {
  return <AppProvider>{children}</AppProvider>;
}

export function useTheme() {
  const { theme, toggleTheme, colors } = useAppContext();
  return { theme, toggleTheme, colors };
}
