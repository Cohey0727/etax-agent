import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useEffect } from "react";
import { colors, radius, springs } from "@/theme";
import { AppText } from "../AppText";
import { BouncePressable } from "../BouncePressable";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
}

/** 選択中のピルがバネで弾むタブ。ラベルは折り返さない。 */
export function Tabs<T extends string>({ items, activeId, onChange }: TabsProps<T>) {
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <TabButton
          key={item.id}
          active={item.id === activeId}
          label={item.label}
          onPress={() => onChange(item.id)}
        />
      ))}
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (active) {
      pop.value = 1.12;
      pop.value = withSpring(1, springs.bouncy);
    }
  }, [active, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <BouncePressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      pressScale={0.94}
      style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
    >
      <Animated.View style={style}>
        <AppText
          numberOfLines={1}
          size="sm"
          weight="bold"
          style={{ color: active ? colors.onAccent : colors.textSubtle }}
        >
          {label}
        </AppText>
      </Animated.View>
    </BouncePressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tabActive: { backgroundColor: colors.accent },
  tabIdle: { backgroundColor: "transparent" },
});
