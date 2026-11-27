import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton, AppText, Card, Chip } from "@/components";
import { space } from "@/theme";
import { formatDate } from "@/utils";
import {
  FilingStatusKey,
  FilingStatusToggleOutcome,
  toggleFilingStatus,
  useFilingStatus,
} from "../useFilingStatus";

export interface FilingStatusToggleProps {
  year: number;
  /** 対象のステータス項目（収支 = confirmed、控除・計算 = calculated）。 */
  statusKey: FilingStatusKey;
  label: string;
  description: string;
  /** 未確定→確定に切り替えた直後に呼ばれる（確定スナップショットの保存など）。できたか。 */
  onConfirm?: () => Promise<boolean>;
  /** true のときはカードで囲まず、既存のカードの中にそのまま置ける形で出す。 */
  bare?: boolean;
}

const outcomeErrors: Record<FilingStatusToggleOutcome, string | null> = {
  saved: null,
  statusFailed: "保存できませんでした。サーバーへの接続を確認してください。",
  confirmFailed:
    "確定しましたが、計算結果の控えを保存できませんでした。確定解除してから確定し直すと、控えを作り直します。",
};

/**
 * 「確定する／確定解除」のバー。そのタブの作業を終えたらその場で
 * 確定でき、総合タブ・ダッシュボードと状態を共有する。
 * 既定では独立したカードとして出し、bare のときは他のカードの中に置く。
 */
export function FilingStatusToggle({
  year,
  statusKey,
  label,
  description,
  onConfirm,
  bare = false,
}: FilingStatusToggleProps) {
  const { status, loaded, available, savingKey, toggle } = useFilingStatus(year);
  const [error, setError] = useState<string | null>(null);
  const done = status[statusKey];
  const doneAt = status[`${statusKey}_at`];

  const handlePress = async () => {
    setError(null);
    const outcome = await toggleFilingStatus(!done, () => toggle(statusKey), onConfirm);
    setError(outcomeErrors[outcome]);
  };

  const content = (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <AppText size="lg" weight="bold">
          {label}
        </AppText>
        <Chip
          label={done ? `確定${doneAt ? `（${formatDate(doneAt)}）` : ""}` : "未確定"}
          tone={done ? "accent" : "muted"}
        />
      </View>
      <AppText size="sm" tone="muted">
        {description}
      </AppText>
      {loaded && !available ? (
        <AppText size="sm" tone="muted">
          ステータスを保存するサーバーに接続できていません。「確定する」は接続時に使えます。
        </AppText>
      ) : null}
      {error ? <AlertBox tone="error" message={error} /> : null}
      <AppButton
        label={done ? "確定解除" : "確定する"}
        variant={done ? "ghost" : "primary"}
        disabled={!available || savingKey === statusKey}
        loading={savingKey === statusKey}
        onPress={() => void handlePress()}
      />
    </View>
  );

  return bare ? content : <Card>{content}</Card>;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  headRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
});
