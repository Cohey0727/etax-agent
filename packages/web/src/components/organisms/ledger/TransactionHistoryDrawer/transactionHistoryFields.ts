import { ledgerIncomeTypeLabel } from "@etax/shared";
import {
  buildHistoryChanges,
  formatHistoryDateTime,
  historyActionLabel,
  HistoryFieldValue,
  HistoryTimelineEntry,
} from "@components/molecules/HistoryTimeline/historyChanges";
import { LedgerTransactionSnapshot, TransactionHistoryEntry } from "@types";
import { formatYen } from "@utils/format";

/**
 * transactionHistoryFields.ts — 取引の変更履歴（API形式）を、タイムライン
 * 表示用の項目並び・要約へ変換する。スナップショットの項目構成と整形は
 * ここに閉じる。
 */

/** 取引スナップショットを表示項目の並びにする。 */
export const transactionSnapshotFields = (
  snapshot: LedgerTransactionSnapshot,
): HistoryFieldValue[] => [
  { label: "日付", value: snapshot.date },
  { label: "年度", value: `${snapshot.fiscal_year}年` },
  { label: "摘要", value: snapshot.description },
  { label: "金額", value: formatYen(snapshot.amount) },
  { label: "勘定科目", value: snapshot.category },
  { label: "区分", value: ledgerIncomeTypeLabel(snapshot.income_type) },
  { label: "税区分", value: snapshot.tax_category || "未設定" },
  { label: "事業割合", value: `${snapshot.business_ratio_percent}%` },
  { label: "按分根拠", value: snapshot.business_ratio_basis || "―" },
  { label: "出所", value: snapshot.account },
  // 削除の履歴は前後で項目が同じになるため、削除日時だけを差分として出す。
  ...(snapshot.deleted_at
    ? [{ label: "削除日時", value: formatHistoryDateTime(snapshot.deleted_at) }]
    : []),
];

/** 履歴1件をタイムラインの1件にする。要約は変更後（削除時は変更前）から作る。 */
export const toTransactionTimelineEntry = (
  entry: TransactionHistoryEntry,
): HistoryTimelineEntry => {
  const snapshot = entry.after ?? entry.before;
  return {
    id: entry.id,
    actionLabel: historyActionLabel(entry.action),
    occurredAt: formatHistoryDateTime(entry.created_at),
    summary: snapshot
      ? `${snapshot.date} ${snapshot.description} ${formatYen(snapshot.amount)}`
      : undefined,
    changes: buildHistoryChanges(
      entry.before ? transactionSnapshotFields(entry.before) : null,
      entry.after ? transactionSnapshotFields(entry.after) : null,
    ),
  };
};
