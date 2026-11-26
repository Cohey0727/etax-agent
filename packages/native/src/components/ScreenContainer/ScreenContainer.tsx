import { ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";

type Props = {
  children: ReactNode;
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
  },
  root: {
    backgroundColor: "#f3f2fa",
    flex: 1,
  },
});

/** 画面共通の余白と背景を持つスクロール容器。 */
export function ScreenContainer({ children }: Props) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  );
}
