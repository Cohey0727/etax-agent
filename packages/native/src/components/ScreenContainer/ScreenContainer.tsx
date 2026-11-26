import { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "@/theme";

export interface ScreenContainerProps {
  children?: ReactNode;
  /** スクロールさせない画面（リスト自体がスクロールする場合）。 */
  noScroll?: boolean;
}

/** 画面の地（淡いラベンダーグレー）と余白を担うコンテナ。下端は端末のセーフエリア分も空ける。 */
export function ScreenContainer({ children, noScroll }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  if (noScroll) {
    return <View style={[styles.fill, { paddingBottom: insets.bottom }]}>{children}</View>;
  }
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: space.xl + insets.bottom }]}
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
  content: { padding: space.md, gap: space.md },
});
