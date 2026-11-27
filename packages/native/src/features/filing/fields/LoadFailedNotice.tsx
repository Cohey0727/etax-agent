import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton } from "@/components";
import { space } from "@/theme";

export interface LoadFailedNoticeProps {
  /** 何を取得できなかったか（例: 「申告入力を取得できませんでした。」）。 */
  message: string;
  onRetry: () => void;
}

/**
 * 保存値を取得できなかったときに、入力欄の代わりに出す通知と再読み込みボタン。
 * 取得できないまま空の入力欄を出すと、そこへの入力でサーバーの値を上書きしてしまう。
 */
export function LoadFailedNotice({ message, onRetry }: LoadFailedNoticeProps) {
  return (
    <View style={styles.wrap}>
      <AlertBox tone="error" message={`${message}サーバーへの接続を確認してください。`} />
      <AppButton label="再読み込み" variant="ghost" size="sm" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
