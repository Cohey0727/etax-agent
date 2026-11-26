import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";
import { AppText } from "../AppText";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
}

/** セグメント型のタブ。セレクター系なのでバウンスアニメーションは使わない。ラベルは折り返さない。 */
export function Tabs<T extends string>({ items, activeId, onChange }: TabsProps<T>) {
  return (
    <View style={styles.row}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.id)}
            style={({ pressed }) => [
              styles.tab,
              active ? styles.tabActive : styles.tabIdle,
              pressed && !active ? styles.tabPressed : null,
            ]}
          >
            <AppText
              numberOfLines={1}
              size="sm"
              weight="bold"
              style={{ color: active ? colors.onAccent : colors.textSubtle }}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
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
  tabPressed: { backgroundColor: colors.hover },
});
