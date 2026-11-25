import {
  buildHistoryChanges,
  formatHistoryDateTime,
  historyActionLabel,
  HistoryFieldValue,
  HistoryTimelineEntry,
} from "@components/molecules/HistoryTimeline/historyChanges";
import { FilingSubmission, FilingSubmissionHistoryEntry } from "@types";

/**
 * submissionHistoryFields.ts — 提出の記録の変更履歴（API形式）を、
 * タイムライン表示用の項目並び・要約へ変換する。
 */

/** 提出の記録スナップショットを表示項目の並びにする。 */
export const submissionSnapshotFields = (
  snapshot: FilingSubmission,
): HistoryFieldValue[] => [
  { label: "受付番号", value: snapshot.acceptance_number || "―" },
  { label: "提出日", value: snapshot.submitted_date ?? "―" },
  { label: "受信通知PDF", value: snapshot.receipt ? "添付あり" : "なし" },
];

/** 履歴1件をタイムラインの1件にする。要約は変更後（削除時は変更前）から作る。 */
export const toSubmissionTimelineEntry = (
  entry: FilingSubmissionHistoryEntry,
): HistoryTimelineEntry => {
  const snapshot = entry.after ?? entry.before;
  return {
    id: entry.id,
    actionLabel: historyActionLabel(entry.action),
    occurredAt: formatHistoryDateTime(entry.created_at),
    summary: snapshot?.acceptance_number
      ? `受付番号: ${snapshot.acceptance_number}`
      : "受付番号なし",
    changes: buildHistoryChanges(
      entry.before ? submissionSnapshotFields(entry.before) : null,
      entry.after ? submissionSnapshotFields(entry.after) : null,
    ),
  };
};
