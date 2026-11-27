import { StyleSheet, Text, TextProps } from "react-native";
import { colors, fontFamily, fontSizes, FontWeightName } from "@/theme";

export interface AppTextProps extends TextProps {
  /** 文字の大きさの段階。 */
  size?: keyof typeof fontSizes;
  weight?: FontWeightName;
  tone?: "text" | "subtle" | "muted" | "accent" | "positive" | "negative" | "onNavy" | "onNavySubtle";
  align?: "left" | "center" | "right";
}

const toneMap = {
  text: colors.text,
  subtle: colors.textSubtle,
  muted: colors.muted,
  accent: colors.accentText,
  positive: colors.positive,
  negative: colors.negative,
  onNavy: colors.onNavy,
  onNavySubtle: colors.onNavySubtle,
} as const;

/** 書体（IBM Plex Sans JP）とトークンを適用したテキスト。 */
export function AppText({
  size = "md",
  weight = "regular",
  tone = "text",
  align,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[
        styles.base,
        { fontFamily: fontFamily[weight], fontSize: fontSizes[size], color: toneMap[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { lineHeight: 22 },
});
