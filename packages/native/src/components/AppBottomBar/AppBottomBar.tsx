import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChatSheet } from "@/state/ChatSheetContext";
import { useSidebar } from "@/state/SidebarContext";
import { colors, radius, space } from "@/theme";
import { LineIcon } from "../LineIcon";

/**
 * 画面下部に浮かぶボトムバー。左ボタンでサイドバーを開き、
 * 右ボタンでチャットシートを開く。
 */
export function AppBottomBar() {
  const insets = useSafeAreaInsets();
  const { sidebarOpen, openSidebar } = useSidebar();
  const { chatOpen, openChat } = useChatSheet();
  return (
    <View pointerEvents="box-none" style={[styles.root, { bottom: insets.bottom + space.sm }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="メニューを開く"
          aria-pressed={sidebarOpen}
          onPress={openSidebar}
          style={({ pressed }) => [
            styles.button,
            sidebarOpen ? styles.buttonActive : null,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <LineIcon name="menu" size={24} color={sidebarOpen ? colors.accent : colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="チャットを開く"
          aria-pressed={chatOpen}
          onPress={openChat}
          style={({ pressed }) => [
            styles.button,
            chatOpen ? styles.buttonActive : null,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <LineIcon name="agent" size={24} color={chatOpen ? colors.accent : colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", left: space.md, right: space.md, zIndex: 40 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    shadowColor: "#18124d",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  button: {
    width: 48,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonActive: { backgroundColor: colors.accentSoft },
  buttonPressed: { backgroundColor: colors.lineSoft },
});
