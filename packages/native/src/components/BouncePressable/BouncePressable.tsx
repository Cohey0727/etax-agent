import { ReactNode } from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { springs } from "@/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BouncePressableProps extends Omit<PressableProps, "style" | "children"> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 押下時に縮む比率。 */
  pressScale?: number;
}

/**
 * 押すとバネで縮み、離すと弾んで戻るプレス可能要素。
 * アプリ内のタップ対象は原則これ（または AppButton）を経由する。
 */
export function BouncePressable({
  children,
  style,
  pressScale = 0.96,
  disabled,
  ...rest
}: BouncePressableProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(pressScale, springs.hard);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.bouncy);
      }}
      style={[animatedStyle, style, disabled ? { opacity: 0.45 } : null]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
