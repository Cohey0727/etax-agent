/**
 * AnimatedSplash.tsx — アプリ内の起動ビュー。
 * 濃紺グラデーションの上に、そろばんの珠が1つずつスプリングで弾んで
 * 落ち着き、ワードマークとコピーが現れる。準備完了後にフェードして消える。
 */
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SorobanBead } from "@/components/SorobanMark";
import { colors, fontFamily, springs } from "@/theme";

const BEAD_WIDTH = 96;
const MIN_SHOW_MS = 1500;

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  beads: {
    width: BEAD_WIDTH * 2,
  },
  beadRow: {
    flexDirection: "row",
  },
  wordmark: {
    flexDirection: "row",
    marginTop: 30,
  },
  wordmarkText: {
    color: colors.surface,
    fontFamily: fontFamily.bold,
    fontSize: 34,
    letterSpacing: 0.5,
  },
  wordmarkAccent: {
    color: colors.lavenderLight,
    fontFamily: fontFamily.bold,
    fontSize: 34,
    letterSpacing: 0.5,
  },
  tagline: {
    color: colors.lavenderLight,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    marginTop: 10,
  },
});

function BouncingBead({ tone, index }: { tone: "a" | "b"; index: number }) {
  const translateY = useSharedValue(-72);
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = 120 + index * 130;
    translateY.value = withDelay(delay, withSpring(0, springs.bouncy));
    scale.value = withDelay(delay, withSpring(1, springs.bouncy));
    opacity.value = withDelay(delay, withTiming(1, { duration: 160 }));
  }, [index, opacity, scale, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <SorobanBead tone={tone} width={BEAD_WIDTH} />
    </Animated.View>
  );
}

export function AnimatedSplash({
  ready,
  onFinish,
}: {
  /** 起動準備（フォント・認証確認）が終わったか。 */
  ready: boolean;
  onFinish: () => void;
}) {
  const containerOpacity = useSharedValue(1);
  const startedAt = useSharedValue(Date.now());

  useEffect(() => {
    startedAt.value = Date.now();
  }, [startedAt]);

  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - startedAt.value;
    const wait = Math.max(0, MIN_SHOW_MS - elapsed);
    const timer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 340 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, containerOpacity, onFinish, startedAt]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));

  return (
    <Animated.View style={[styles.root, containerStyle]}>
      <LinearGradient
        colors={[colors.navyDeep, "#2a1c96", colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.beads}>
        <View style={styles.beadRow}>
          <BouncingBead tone="a" index={0} />
          <BouncingBead tone="b" index={1} />
        </View>
        <View style={styles.beadRow}>
          <BouncingBead tone="b" index={2} />
          <BouncingBead tone="a" index={3} />
        </View>
      </View>
      <Animated.View entering={FadeInDown.delay(620).springify().damping(13)} style={styles.wordmark}>
        <Text style={styles.wordmarkAccent}>e</Text>
        <Text style={styles.wordmarkText}>TaxAgent</Text>
      </Animated.View>
      <Animated.Text
        entering={FadeInDown.delay(820).springify().damping(15)}
        style={styles.tagline}
      >
        AIが、すべてやります。
      </Animated.Text>
    </Animated.View>
  );
}
