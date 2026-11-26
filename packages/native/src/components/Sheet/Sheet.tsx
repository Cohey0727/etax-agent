import { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { colors, radius, space, springs } from "@/theme";
import { AppText } from "../AppText";

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** 中身をスクロール可能にする（長いフォーム用）。 */
  scroll?: boolean;
  /**
   * 登場アニメーション。"spring" はバネでせり上がる（既定）。
   * セレクター系は反応の速さ優先で "slide"（バネなし）にする。
   */
  entry?: "spring" | "slide";
}

/** 下からせり上がるボトムシート。編集フォームや選択肢の受け皿。 */
export function Sheet({ visible, title, onClose, children, scroll, entry = "spring" }: SheetProps) {
  const body = <View style={styles.body}>{children}</View>;
  const entering =
    entry === "slide"
      ? SlideInDown.duration(180)
      : SlideInDown.springify().damping(springs.soft.damping).stiffness(springs.soft.stiffness);
  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="閉じる" onPress={onClose} style={styles.backdropTouch} />
        <Animated.View entering={entering} style={styles.panel}>
          <View style={styles.header}>
            <AppText size="lg" weight="bold" numberOfLines={1} style={styles.title}>
              {title}
            </AppText>
            <Pressable accessibilityLabel="閉じる" hitSlop={10} onPress={onClose}>
              <AppText size="xl" tone="muted">
                ×
              </AppText>
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
              {body}
            </ScrollView>
          ) : (
            body
          )}
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
    paddingBottom: space.lg,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { flex: 1 },
  body: { gap: space.sm },
  scroll: { flexGrow: 0 },
});
