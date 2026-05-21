import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../context/ThemeContext";

const ICONS = {
  wallet: "$",
  trend: "^",
  loan: "%",
  proof: "#",
  moon: ")",
  sun: "*",
  key: "@",
};

const TONES = {
  default: "primary",
  income: "success",
  expense: "expense",
  proof: "tertiary",
};

function AppIcon({ name, active = false, size = 24 }) {
  const { colors } = useTheme();
  const icon = ICONS[name] ?? "?";

  return (
    <View
      style={[
        styles.iconShell,
        {
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          backgroundColor: active ? colors.primaryContainer : colors.surfaceLow,
        },
      ]}
    >
      <Text
        style={[
          styles.iconText,
          {
            color: active ? colors.onPrimaryContainer : colors.textSecondary,
            fontSize: Math.max(12, Math.round(size * 0.7)),
          },
        ]}
      >
        {icon}
      </Text>
    </View>
  );
}

function WarmCard({ children, style }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.warmCard,
        {
          backgroundColor: colors.surfaceLowest,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionHeader({ eyebrow, title, right }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {right ? <View style={styles.sectionRight}>{right}</View> : null}
    </View>
  );
}

function PillButton({ label, onPress, variant = "primary", disabled = false, style }) {
  const { colors } = useTheme();
  const isPrimary = variant === "primary";
  const isQuiet = variant === "quiet";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillButton,
        {
          backgroundColor: isPrimary
            ? colors.primary
            : isQuiet
              ? colors.surfaceLow
              : colors.primaryContainer,
          borderColor: isPrimary ? colors.primary : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.pillButtonText,
          {
            color: isPrimary
              ? colors.buttonTextOnPrimary
              : isQuiet
                ? colors.text
                : colors.onPrimaryContainer,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BentoMetricCard({ label, value, tone = "default" }) {
  const { colors } = useTheme();
  const toneColor = colors[TONES[tone] ?? TONES.default] ?? colors.primary;

  return (
    <WarmCard style={styles.metricCard}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: toneColor }]}>{value}</Text>
    </WarmCard>
  );
}

function IconNav({ items, activeId, onSelect }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.iconNav, { backgroundColor: colors.surfaceLow }]}>
      {items.map((item) => {
        const active = item.id === activeId;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.id}
            onPress={() => onSelect?.(item.id)}
            style={({ pressed }) => [
              styles.iconNavItem,
              {
                backgroundColor: active ? colors.surfaceLowest : "transparent",
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <AppIcon name={item.icon} active={active} size={22} />
            <Text
              numberOfLines={1}
              style={[
                styles.iconNavLabel,
                { color: active ? colors.text : colors.textSecondary },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProofHint({ onPress, label = "Proof hidden · Tap to view transaction details" }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.proofHint,
        {
          backgroundColor: colors.proofBackground,
          borderColor: colors.success,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppIcon name="proof" active size={18} />
      <Text style={[styles.proofHintText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bentoRow: {
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  iconNav: {
    borderRadius: 28,
    flexDirection: "row",
    gap: 6,
    padding: 6,
  },
  iconNavItem: {
    alignItems: "center",
    borderRadius: 22,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 70,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  iconNavLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
  },
  iconShell: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 24,
  },
  metricCard: {
    flex: 1,
    minHeight: 118,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 10,
  },
  pillButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pillButtonText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
  },
  proofHint: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  proofHintText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
  },
  sectionHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sectionRight: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 4,
  },
  warmCard: {
    borderRadius: 24,
    borderWidth: 1,
    elevation: 2,
    padding: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
});

export {
  AppIcon,
  WarmCard,
  SectionHeader,
  PillButton,
  BentoMetricCard,
  IconNav,
  ProofHint,
};
