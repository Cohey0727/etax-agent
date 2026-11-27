import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { colors, space } from "@/theme";

export interface AuthLoadErrorProps {
  message: string;
  onRetry: () => Promise<void>;
}

/** 起動時の認証の確認に失敗したときの画面。保存済みのログインは残したまま、確認をやり直せる。 */
export function AuthLoadError({ message, onRetry }: AuthLoadErrorProps) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <View style={styles.root}>
      <AlertBox tone="error" message={message} />
      <AppButton label="再読み込み" loading={retrying} onPress={() => void handleRetry()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: space.md, gap: space.md, backgroundColor: colors.bg },
});
