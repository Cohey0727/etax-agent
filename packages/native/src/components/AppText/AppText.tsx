import { StyleSheet, Text, TextProps } from "react-native";
import { colors, fontFamily, FontWeightName } from "@/theme";

export interface AppTextProps extends TextProps {
  /** 文字の大きさの段階。 */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl" | "hero";
  weight?: FontWeightName;
  tone?: "text" | "subtle" | "muted" | "accent" | "positive" | "negative" | "onNavy" | "onNavySubtle";
  align?: "left" | "center" | "right";
}

const sizeMap = { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, hero: 40 } as const;
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
        { fontFamily: fontFamily[weight], fontSize: sizeMap[size], color: toneMap[tone] },
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
