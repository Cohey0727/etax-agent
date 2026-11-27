import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentChatScreen } from "@/features/agent";
import { useChatSheet } from "@/state/ChatSheetContext";
import { colors, radius, space } from "@/theme";
import { AppText } from "../AppText";

/** チャットを開くためのボトムシート。画面の92%の高さでせり上がる。 */
export function ChatSheet() {
  const { chatOpen, closeChat } = useChatSheet();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="none" onRequestClose={closeChat} transparent visible={chatOpen}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="閉じる" onPress={closeChat} style={styles.backdropTouch} />
        <Animated.View
          entering={SlideInDown.duration(220)}
          style={[styles.panel, { height: height * 0.92, paddingBottom: insets.bottom }]}
        >
          <View style={styles.header}>
            <AppText size="lg" weight="bold" numberOfLines={1} style={styles.title}>
              チャット
            </AppText>
            <Pressable accessibilityLabel="閉じる" hitSlop={10} onPress={closeChat}>
              <AppText size="xl" tone="muted">
                ×
              </AppText>
            </Pressable>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.body}
          >
            <AgentChatScreen onBeforeNavigate={closeChat} />
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(24, 18, 77, 0.45)", justifyContent: "flex-end" },
  backdropTouch: { flex: 1 },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { flex: 1 },
  body: { flex: 1 },
});
