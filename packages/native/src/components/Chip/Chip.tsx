import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";
import { AppText } from "../AppText";

export type ChipTone = "accent" | "muted" | "positive" | "negative" | "warn";

const toneStyles: Record<ChipTone, { bg: string; fg: string }> = {
  accent: { bg: colors.accentSoft, fg: colors.accentText },
  muted: { bg: colors.hover, fg: colors.textSubtle },
  positive: { bg: "#e2f5ec", fg: colors.positive },
  negative: { bg: colors.errorBg, fg: colors.negative },
  warn: { bg: colors.warnBg, fg: colors.warnText },
};

export interface ChipProps {
  label: string;
  tone?: ChipTone;
}

/** 状態を示す小さなチップ。テキストは折り返さない。 */
export function Chip({ label, tone = "muted" }: ChipProps) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <AppText numberOfLines={1} size="xs" weight="semibold" style={{ color: t.fg }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
});
