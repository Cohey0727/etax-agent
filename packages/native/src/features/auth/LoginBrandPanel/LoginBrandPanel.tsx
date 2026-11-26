import { LinearGradient } from "expo-linear-gradient";
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import Svg, { Defs, Pattern, RadialGradient, Rect, Stop, Circle, Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { SorobanMark } from "@/components/SorobanMark";
import { colors, space } from "@/theme";

/** 罫線グリッドの装飾。全面に敷き、下半分は地のグラデーションで覆って消す。 */
function GridTexture() {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const patternId = `${rawId}-grid`;
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id={patternId} width={44} height={44} patternUnits="userSpaceOnUse">
            <Path d="M44 0H0V44" fill="none" stroke={colors.navySoft} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
      <LinearGradient
        colors={["transparent", colors.navyDeep]}
        locations={[0.45, 0.92]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </>
  );
}

/** 色つきの円を放射グラデーションでぼかしたグロー装飾。 */
function Glow({
  color,
  size,
  style,
}: {
  color: string;
  size: number;
  style: { top?: number; right?: number; bottom?: number; left?: number };
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradientId = `${rawId}-glow`;
  return (
    <Svg
      width={size}
      height={size}
      style={[styles.glow, style]}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
    </Svg>
  );
}

/**
 * LoginBrandPanel — ログイン画面上部のブランド表示。
 * ロゴとワードマークだけを置く。機能の説明や訴求文は置かない。
 * 登場はフェードのみ。
 */
export function LoginBrandPanel() {
  return (
    <LinearGradient
      colors={[colors.navy, colors.navyDeep]}
      start={{ x: 0.35, y: 0 }}
      end={{ x: 0.65, y: 1 }}
      style={styles.panel}
    >
      <GridTexture />
      <Glow color={colors.lavender} size={340} style={{ top: -150, right: -110 }} />
      <Glow color={colors.accent} size={300} style={{ bottom: -170, left: -110 }} />

      <Animated.View entering={FadeIn.duration(600)}>
        <LinearGradient
          colors={[colors.navyDeep, "#2a1c96", colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brandTile}
        >
          <SorobanMark width={40} />
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(140).duration(550)} style={styles.brandTexts}>
        <AppText size="xl" weight="bold" tone="onNavy">
          eTaxAgent
        </AppText>
        <AppText size="xs" tone="onNavySubtle">
          確定申告丸投げ
        </AppText>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    gap: space.md,
  },
  glow: { position: "absolute" },
  brandTile: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTexts: { alignItems: "center", gap: 2 },
});
