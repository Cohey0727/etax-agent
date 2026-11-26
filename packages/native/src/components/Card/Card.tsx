import { ReactNode } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { cardShadow, colors, radius, space, springs } from "@/theme";

export interface CardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 並び順に応じた登場の遅延（ミリ秒）。親が並び位置を渡す。 */
  index?: number;
  /** 登場アニメーションを止める（フォーム編集中など）。 */
  noEnter?: boolean;
  /** 登場をバネではなくフェードにする（静かな登場が要る面用）。 */
  fadeEnter?: boolean;
  /** フェード登場の遅延（ミリ秒）。fadeEnter のときに使う。 */
  enterDelay?: number;
}

/** 白い面のカード。登場時はバネでポップする（fadeEnter 指定時はフェード）。 */
export function Card({ children, style, index = 0, noEnter, fadeEnter, enterDelay = 0 }: CardProps) {
  return (
    <Animated.View
      entering={
        noEnter
          ? undefined
          : fadeEnter
            ? FadeInDown.delay(enterDelay).duration(600)
            : FadeInDown.delay(Math.min(index, 8) * 60)
                .springify()
                .damping(springs.bouncy.damping)
                .stiffness(springs.bouncy.stiffness)
      }
      style={[styles.card, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    ...cardShadow,
  },
});
