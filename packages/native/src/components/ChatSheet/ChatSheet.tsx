import { useEffect, useRef } from "react";
import {
  Animated,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AgentChatScreen } from "@/features/agent";
import { useChatSheet } from "@/state/ChatSheetContext";
import { colors, radius, space } from "@/theme";
import { AppText } from "../AppText";

/**
 * チャットを開くためのボトムシート。画面の92%の高さでせり上がる。
 * 閉じても会話（送信中の応答を含む）を失わないよう、Modal を使わずに常にマウントしておき、
 * 閉じている間は画面外へ下げて触れないようにする。
 */
export function ChatSheet() {
  const { chatOpen, closeChat } = useChatSheet();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!chatOpen) Keyboard.dismiss();
    Animated.timing(progress, {
      toValue: chatOpen ? 1 : 0,
      duration: chatOpen ? 220 : 180,
      useNativeDriver: true,
    }).start();
  }, [chatOpen, progress]);

  useEffect(() => {
    if (!chatOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeChat();
      return true;
    });
    return () => subscription.remove();
  }, [chatOpen, closeChat]);

  const panelHeight = height * 0.92;
  return (
    <View
      pointerEvents={chatOpen ? "auto" : "none"}
      accessibilityElementsHidden={!chatOpen}
      importantForAccessibility={chatOpen ? "auto" : "no-hide-descendants"}
      style={styles.root}
    >
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable accessibilityLabel="閉じる" onPress={closeChat} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            height: panelHeight,
            paddingBottom: insets.bottom,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [panelHeight, 0],
                }),
              },
            ],
          },
        ]}
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
  );
}

const styles = StyleSheet.create({
  // サイドバー（zIndex 50）より手前に出す
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 60, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(24, 18, 77, 0.45)",
  },
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
