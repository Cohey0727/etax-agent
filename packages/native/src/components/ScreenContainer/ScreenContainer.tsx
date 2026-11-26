import { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors, space } from "@/theme";

export interface ScreenContainerProps {
  children?: ReactNode;
  /** スクロールさせない画面（リスト自体がスクロールする場合）。 */
  noScroll?: boolean;
}

/** 画面の地（淡いラベンダーグレー）と余白を担うコンテナ。 */
export function ScreenContainer({ children, noScroll }: ScreenContainerProps) {
  if (noScroll) {
    return <View style={styles.fill}>{children}</View>;
  }
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.md, gap: space.md, paddingBottom: space.xl },
});
