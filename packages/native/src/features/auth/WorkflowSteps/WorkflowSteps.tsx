import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/AppText";
import { LineIcon, LineIconName } from "@/components/LineIcon";
import { colors, radius, space } from "@/theme";

interface WorkflowStep {
  icon: LineIconName;
  label: string;
  caption: string;
}

// AI が回す整備ワークフローの流れ。実装済みの処理範囲だけを書く。
const STEPS: readonly WorkflowStep[] = [
  { icon: "receipt", label: "取り込み", caption: "領収書・明細を読み取り" },
  { icon: "book", label: "帳簿", caption: "仕訳を自動で記録" },
  { icon: "check", label: "チェック", caption: "漏れや不整合を検出" },
  { icon: "chart", label: "レポート", caption: "試算表・資金繰りを集計" },
  { icon: "fileCheck", label: "申告書", caption: "決算書と XTX を生成" },
  { icon: "send", label: "提出記録", caption: "提出の控えを保管" },
];

const STEP_BASE_DELAY = 550;
const STEP_INTERVAL = 150;
const DOT_DELAYS = [0, 180, 360] as const;

/** 「処理中」を示すドット。明滅はフェード（不透明度）の往復で表す。 */
function PulseDot({ delay }: { delay: number }) {
  const progress = useSharedValue(0.25);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 700 }), withTiming(0.25, { duration: 700 })),
        -1,
        false,
      ),
    );
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.7 + progress.value * 0.45 }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

/**
 * WorkflowSteps — AI が処理する流れをタイムラインで見せる装飾。
 * ステップが順にフェードで現れ、処理中ドットが流れ続けることで「AI が回している」様子を伝える。
 */
export function WorkflowSteps() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <LinearGradient
          colors={[colors.lavender, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardIcon}
        >
          <LineIcon name="sparkles" size={15} color={colors.onAccent} />
        </LinearGradient>
        <AppText size="xs" weight="semibold" tone="onNavy" style={styles.cardTitle}>
          AI ワークフロー
        </AppText>
        <View style={styles.dots}>
          {DOT_DELAYS.map((delay) => (
            <PulseDot key={delay} delay={delay} />
          ))}
        </View>
      </View>
      <View style={styles.steps}>
        <LinearGradient
          colors={[colors.lavender, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.line}
        />
        {STEPS.map((step, index) => (
          <Animated.View
            key={step.label}
            entering={FadeInDown.delay(STEP_BASE_DELAY + index * STEP_INTERVAL).duration(450)}
            style={styles.step}
          >
            <View style={styles.node}>
              <LineIcon name={step.icon} size={15} color={colors.lavender} />
            </View>
            <AppText size="md" weight="semibold" tone="onNavy">
              {step.label}
            </AppText>
            <AppText size="xs" tone="onNavySubtle" numberOfLines={1} style={styles.stepCaption}>
              {step.caption}
            </AppText>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 濃紺地の上に浮くガラス風カード。
  card: {
    backgroundColor: colors.navySoft,
    borderWidth: 1,
    borderColor: colors.navySoft,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { letterSpacing: 0.5 },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 5, height: 5, borderRadius: radius.pill, backgroundColor: colors.lavender },
  // 縦線を絶対配置するための受け皿。
  steps: { position: "relative", gap: space.sm },
  // ノードの中心を貫く縦線。グラデーションで流れの向きを示す。
  line: {
    position: "absolute",
    left: 15,
    top: 16,
    bottom: 16,
    width: 2,
    borderRadius: 1,
    opacity: 0.55,
  },
  step: { flexDirection: "row", alignItems: "center", gap: space.md },
  node: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.navySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCaption: { flex: 1 },
});
