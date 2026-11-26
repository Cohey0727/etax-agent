import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  fetchRecentTransactionHistory,
  fetchTransactionHistory,
  TransactionHistoryEntry,
} from "@/api";
import { AppText, Chip } from "@/components";
import { formatDate, formatYen } from "@/utils";
import { incomeTypeLabel } from "../options";

const ACTION_LABELS: Record<string, string> = {
  create: "登録",
  update: "訂正",
  delete: "削除",
};

/**
 * 変更履歴（電子帳簿保存法の訂正・削除履歴）。シート内で使う。
 * transactionId を渡すとその取引だけ、未指定なら全取引の履歴を新しい順に表示する。
 */
export function TransactionHistory({ transactionId }: { transactionId?: number }) {
  const [entries, setEntries] = useState<TransactionHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load =
      transactionId !== undefined
        ? fetchTransactionHistory(transactionId)
        : fetchRecentTransactionHistory();
    void load.then((result) => {
      if (cancelled) return;
      if (result === null) setFailed(true);
      else setEntries(result);
    });
    return () => { cancelled = true; };
  }, [transactionId]);

  if (failed) return <AppText size="sm" tone="muted">履歴を取得できませんでした。サーバーへの接続を確認してください。</AppText>;
  if (entries === null) return <AppText size="sm" tone="muted">読み込み中…</AppText>;
  if (entries.length === 0) return <AppText size="sm" tone="muted">変更履歴はまだありません。</AppText>;

  return (
    <View style={{ gap: 10 }}>
      {entries.map((entry) => {
        const snap = entry.after ?? entry.before;
        return (
          <View key={entry.id} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Chip label={ACTION_LABELS[entry.action] ?? entry.action} tone="accent" />
              <AppText size="xs" tone="muted">{formatDate(entry.created_at)}</AppText>
            </View>
            {snap ? (
              <AppText size="sm">
                {snap.date} {snap.description} {formatYen(snap.amount)}／{snap.category}／{incomeTypeLabel(snap.income_type)}
              </AppText>
            ) : null}
            {entry.before && entry.after ? (
              <AppText size="xs" tone="muted">
                変更前: {entry.before.description} {formatYen(entry.before.amount)}／{entry.before.category}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
