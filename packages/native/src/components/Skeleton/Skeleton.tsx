import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, radius } from "@/theme";

export interface SkeletonBarProps {
  width?: number | `${number}%`;
  height?: number;
}

/** 読み込み中のプレースホルダーバー。明滅しながら待つ。 */
export function SkeletonBar({ width = "100%", height = 14 }: SkeletonBarProps) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.bar, { width, height }, style]} />;
}

/** カード形のスケルトン（見出し＋数行）。 */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBar width="45%" height={18} />
      <SkeletonBar width="90%" />
      <SkeletonBar width="75%" />
      <SkeletonBar width="60%" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.border, borderRadius: 6 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
});
