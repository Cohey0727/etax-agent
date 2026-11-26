import { StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, radius, space } from "@/theme";
import { AppText } from "../AppText";

export type AlertTone = "info" | "warn" | "error" | "success";

const toneStyles: Record<AlertTone, { bg: string; border: string; fg: string }> = {
  info: { bg: colors.accentSoft, border: colors.borderStrong, fg: colors.textSubtle },
  warn: { bg: colors.warnBg, border: colors.warnBorder, fg: colors.warnText },
  error: { bg: colors.errorBg, border: colors.errorBorder, fg: colors.errorText },
  success: { bg: "#e2f5ec", border: "#a9dcc3", fg: "#14663f" },
};

export interface AlertBoxProps {
  tone?: AlertTone;
  message: string;
}

/** 注意・警告・エラー・完了の通知ボックス。出現時はふわりとポップする。 */
export function AlertBox({ tone = "info", message }: AlertBoxProps) {
  const t = toneStyles[tone];
  return (
    <Animated.View
      entering={FadeIn.springify().damping(14).stiffness(200)}
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }]}
    >
      <AppText size="sm" style={{ color: t.fg }}>
        {message}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
});
