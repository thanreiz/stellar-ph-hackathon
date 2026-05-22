import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../context/ThemeContext";

const AnimatedPressableComponent = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, onPress, style, disabled, ...props }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const handlePressIn = (e) => {
    setPressed(true);
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 180,
      friction: 6,
    }).start();
    if (props.onPressIn) props.onPressIn(e);
  };

  const handlePressOut = (e) => {
    setPressed(false);
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 180,
      friction: 6,
    }).start();
    if (props.onPressOut) props.onPressOut(e);
  };

  const resolvedStyle = typeof style === "function" ? style({ pressed }) : style;
  const flattened = StyleSheet.flatten(resolvedStyle) || {};
  const existingTransforms = flattened.transform || [];

  return (
    <AnimatedPressableComponent
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        resolvedStyle,
        {
          transform: [...existingTransforms, { scale }],
        },
      ]}
      {...props}
    >
      {typeof children === "function" ? children({ pressed }) : children}
    </AnimatedPressableComponent>
  );
}

const ICONS = {
  wallet: "▣",
  trend: "↗",
  loan: "₱",
  proof: "✓",
  moon: "☾",
  sun: "☀",
  key: "🔑",
  offline: "!",
  online: "✓",
};

const TONES = {
  default: "primary",
  positive: "success",
  income: "success",
  expense: "expense",
  proof: "tertiary",
  neutral: "text",
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
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
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
    </AnimatedPressable>
  );
}

function BentoMetricCard({ label, value, tone = "default" }) {
  const { colors } = useTheme();
  const toneColor = colors[TONES[tone] ?? TONES.default] ?? colors.primary;

  return (
    <WarmCard style={styles.metricCard}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.62}
        numberOfLines={1}
        style={[styles.metricValue, { color: toneColor }]}
      >
        {value}
      </Text>
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
          <AnimatedPressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.id}
            onPress={() => onSelect?.(item.id)}
            style={({ pressed }) => [
              styles.iconNavItem,
              {
                backgroundColor: active ? colors.primary : "transparent",
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <AppIcon name={item.icon} active={active} size={22} />
            <Text
              numberOfLines={1}
              style={[
                styles.iconNavLabel,
                { color: active ? colors.buttonTextOnPrimary : colors.textSecondary },
              ]}
            >
              {item.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function ProofHint({ onPress, label = "Proof hidden · Tap to view transaction details" }) {
  const { colors } = useTheme();
  const interactive = typeof onPress === "function";

  return (
    <AnimatedPressable
      accessibilityRole={interactive ? "button" : undefined}
      accessibilityState={interactive ? undefined : { disabled: true }}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.proofHint,
        {
          backgroundColor: colors.proofBackground,
          borderColor: colors.success,
          opacity: interactive && pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppIcon name="proof" active size={18} />
      <Text style={[styles.proofHintText, { color: colors.text }]}>{label}</Text>
    </AnimatedPressable>
  );
}

function QuickAction({ label, helper, onPress, disabled = false, tone = "primary" }) {
  const { colors } = useTheme();
  const isExpense = tone === "expense";
  const isSecondary = tone === "secondary";
  const isDual = tone === "dual";

  let bg = colors.primary;
  let bc = colors.primary;
  let tc = colors.buttonTextOnPrimary;
  let hc = colors.buttonTextOnPrimary;

  if (disabled) {
    bg = colors.cardSecondary;
    bc = colors.border;
    tc = colors.textSecondary;
    hc = colors.textSecondary;
  } else if (isExpense) {
    bg = colors.expense;
    bc = colors.expense;
    tc = colors.buttonTextOnPrimary;
    hc = colors.buttonTextOnPrimary;
  } else if (isSecondary) {
    bg = colors.surfaceLow;
    bc = colors.border;
    tc = colors.text;
    hc = colors.textSecondary;
  } else if (isDual) {
    bg = colors.primary;
    bc = colors.primary;
    tc = colors.buttonTextOnPrimary;
    hc = colors.buttonTextOnPrimary;
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: bg,
          borderColor: bc,
          opacity: pressed && !disabled ? 0.82 : 1,
          position: "relative",
        },
      ]}
    >
      {isDual && (
        <View
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.expense,
          }}
        />
      )}
      <Text
        style={[
          styles.quickActionLabel,
          { color: tc },
        ]}
      >
        {label}
      </Text>
      {helper ? (
        <Text
          style={[
            styles.quickActionHelper,
            { color: hc },
          ]}
        >
          {helper}
        </Text>
      ) : null}
    </AnimatedPressable>
  );
}

function StatusBanner({ title, body, tone = "default", icon, style }) {
  const { colors } = useTheme();
  const isOffline = tone === "offline";
  const accent = isOffline ? colors.offline || colors.error : colors.success || colors.primary;
  const background = isOffline ? colors.errorContainer : colors.primaryContainer;

  return (
    <View
      style={[
        styles.statusBanner,
        { backgroundColor: background, borderColor: accent },
        style,
      ]}
    >
      <AppIcon name={icon || (isOffline ? "offline" : "online")} active size={18} />
      <View style={styles.statusBannerCopy}>
        <Text style={[styles.statusBannerTitle, { color: colors.text }]}>{title}</Text>
        {body ? <Text style={[styles.statusBannerBody, { color: colors.textSecondary }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

function InfoRow({ label, value, tone = "default" }) {
  const { colors } = useTheme();
  const valueColor = tone === "expense" ? colors.expense : tone === "positive" ? colors.primary : colors.text;

  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoRowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[styles.infoRowValue, { color: valueColor }]}
      >
        {value}
      </Text>
    </View>
  );
}

function SegmentedControl({ options, value, onChange, activeColor }) {
  const { colors } = useTheme();
  const activeBg = activeColor || colors.primary;

  return (
    <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceLow, borderColor: colors.border }]}>
      {options.map((option) => {
        const active = option.id === value;

        return (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.id}
            onPress={() => onChange?.(option.id)}
            style={({ pressed }) => [
              styles.segmentedControlItem,
              {
                backgroundColor: active ? activeBg : "transparent",
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.segmentedControlText,
                { color: active ? colors.buttonTextOnPrimary : colors.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function ProofDetailsCard({ children }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.proofDetailsCard,
        { backgroundColor: colors.cardSecondary, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
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
    gap: 5,
    padding: 5,
  },
  iconNavItem: {
    alignItems: "center",
    borderRadius: 24,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 66,
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
    minHeight: 126,
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
  proofDetailsCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginTop: 12,
    padding: 14,
    width: "100%",
  },
  quickAction: {
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 58,
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickActionHelper: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 2,
    opacity: 0.86,
  },
  quickActionLabel: {
    fontSize: 16,
    fontWeight: "900",
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
  statusBanner: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusBannerBody: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 17,
  },
  statusBannerCopy: {
    flex: 1,
    gap: 2,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0,
  },
  infoRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 42,
    paddingVertical: 8,
  },
  infoRowLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
  },
  infoRowValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "right",
  },
  segmentedControl: {
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  segmentedControlItem: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  segmentedControlText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0,
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
  ProofDetailsCard,
  QuickAction,
  StatusBanner,
  InfoRow,
  SegmentedControl,
};
