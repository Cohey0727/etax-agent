import { LinearGradient } from "expo-linear-gradient";
import { useId } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Defs, Pattern, RadialGradient, Rect, Stop, Circle, Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { LineIcon } from "@/components/LineIcon";
import { SorobanMark } from "@/components/SorobanMark";
import { colors, radius, space } from "@/theme";
import { WorkflowSteps } from "../WorkflowSteps";

// 価値訴求。実装済みの事実の範囲で書く（実績数値などの誇大表示はしない）。
const VALUE_PROPS: readonly string[] = [
  "領収書の取り込みから申告書の作成まで、AI が自動で進めます",
  "MCP 連携で、Claude Code など外部の AI エージェントからそのまま操作できます",
  "計算は決定的エンジン。何度でも同じ結果を再現できます",
];

// 登場はフェードで統一し、Web の rise と同じ間隔で段階的に出す。
const RISE_DELAYS = [50, 160, 300, 440, 620] as const;
const fadeUp = (delay: number) => FadeInDown.delay(delay).duration(650);

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
 * LoginBrandPanel — ログイン画面上部のブランド面。
 * 主役のコピーは「AIが、すべてやります」。自動化の流れ（WorkflowSteps）と
 * 税理士法の線引き注記で、世界観と境界を第一印象で伝える。
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
      <Glow color={colors.lavender} size={340} style={{ top: -120, right: -90 }} />
      <Glow color={colors.accent} size={320} style={{ bottom: -140, left: -100 }} />

      <Animated.View entering={fadeUp(RISE_DELAYS[0])} style={styles.brandRow}>
        <LinearGradient
          colors={[colors.navyDeep, "#2a1c96", colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.brandTile}
        >
          <SorobanMark width={36} />
        </LinearGradient>
        <View style={styles.brandTexts}>
          <AppText size="xl" weight="bold" tone="onNavy">
            eTaxAgent
          </AppText>
          <AppText size="xs" tone="onNavySubtle">
            確定申告 準備ツール
          </AppText>
        </View>
      </Animated.View>

      <Animated.View entering={fadeUp(RISE_DELAYS[1])} style={styles.heroBlock}>
        <AppText size="hero" weight="bold" tone="onNavy" style={styles.headline}>
          AIが、<Text style={styles.headlineAccent}>すべて</Text>やります。
        </AppText>
        <AppText size="md" tone="onNavySubtle" style={styles.lead}>
          取り込みから帳簿、チェック、申告書の作成まで。税務の整備は AI
          が一気通貫で回します。あなたは確認と最終判断だけ。
        </AppText>
      </Animated.View>

      <Animated.View entering={fadeUp(RISE_DELAYS[2])} style={styles.values}>
        {VALUE_PROPS.map((valueProp) => (
          <View key={valueProp} style={styles.valueRow}>
            <View style={styles.valueIcon}>
              <LineIcon name="check" size={13} color={colors.lavender} />
            </View>
            <AppText size="sm" tone="onNavy" style={styles.valueText}>
              {valueProp}
            </AppText>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={fadeUp(RISE_DELAYS[3])}>
        <WorkflowSteps />
      </Animated.View>

      <Animated.View entering={fadeUp(RISE_DELAYS[4])} style={styles.note}>
        <AppText size="xs" tone="onNavySubtle" style={styles.noteText}>
          申告内容の最終確認と e-Tax への提出は、ご本人による操作です。
        </AppText>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  glow: { position: "absolute" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  brandTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTexts: { gap: 2 },
  heroBlock: { gap: space.md },
  headline: { lineHeight: 54 },
  headlineAccent: { color: colors.lavender },
  lead: { lineHeight: 26 },
  values: { gap: space.sm },
  valueRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  valueIcon: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.navySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  valueText: { flex: 1, lineHeight: 20 },
  note: { borderTopWidth: 1, borderColor: colors.navySoft, paddingTop: space.md },
  noteText: { lineHeight: 18 },
});
