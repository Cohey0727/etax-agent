import { Component, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AppButton } from "../AppButton";
import { AppText } from "../AppText";
import { colors, space } from "@/theme";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** 画面の描画エラーをアプリ全体の終了にせず、エラー内容を表示して復帰できるようにする。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.root}>
        <AppText size="lg" weight="bold">
          画面の表示でエラーが発生しました
        </AppText>
        <ScrollView style={styles.box}>
          <AppText size="sm" style={styles.mono}>
            {error.message}
            {"\n\n"}
            {error.stack ?? ""}
          </AppText>
        </ScrollView>
        <AppButton label="再読み込み" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.md, gap: space.md, backgroundColor: colors.bg },
  box: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: space.sm },
  mono: { fontFamily: "IBMPlexSansJP-400" },
});
