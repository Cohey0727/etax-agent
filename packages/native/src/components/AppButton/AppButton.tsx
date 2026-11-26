import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors, fontFamily, radius } from "@/theme";
import { AppText } from "../AppText";
import { BouncePressable } from "../BouncePressable";

export type AppButtonVariant = "primary" | "ghost" | "danger" | "tab" | "navy";

export interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  loading?: boolean;
  /** 左側に置く小さな要素（アイコン代わりの記号など）。 */
  leading?: string;
}

const variantStyles: Record<AppButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  ghost: { bg: colors.surface, fg: colors.accentText, border: colors.borderStrong },
  danger: { bg: colors.negative, fg: "#ffffff" },
  tab: { bg: "transparent", fg: colors.textSubtle },
  navy: { bg: colors.navy, fg: colors.onNavy },
};

/** バネで弾むボタン。ラベルは折り返さない。 */
export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  leading,
}: AppButtonProps) {
  const v = variantStyles[variant];
  const isDisabled = disabled || loading;
  return (
    <BouncePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
        variant === "primary" ? styles.primaryShadow : null,
      ]}
    >
      <View style={styles.row}>
        {leading ? (
          <AppText size="md" weight="bold" style={{ color: v.fg }}>
            {leading}
          </AppText>
        ) : null}
        {loading ? (
          <ActivityIndicator color={v.fg} size="small" />
        ) : (
          <AppText
            numberOfLines={1}
            weight="bold"
            size={size === "sm" ? "sm" : "md"}
            style={{ color: v.fg, fontFamily: fontFamily.bold }}
          >
            {label}
          </AppText>
        )}
      </View>
    </BouncePressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  md: { paddingHorizontal: 18, paddingVertical: 12, minHeight: 46 },
  sm: { paddingHorizontal: 12, paddingVertical: 7, minHeight: 34 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  primaryShadow: {
    shadowColor: "#221a63",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 13,
    elevation: 4,
  },
});
