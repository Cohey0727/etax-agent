/**
 * historyChanges.ts — 変更履歴の前後スナップショットから、表示用の
 * 差分行を作る純関数（molecules/HistoryTimeline の補助）。
 *
 * スナップショットは「項目ラベル＋表示用文字列」の並びに変換済みの形で
 * 受け取る（ドメイン知識は呼び出し側の organism が持つ）。
 */
import { HistoryAction } from "@types";

/** スナップショットの1項目（表示用に整形済みの値）。 */
export interface HistoryFieldValue {
  label: string;
  value: string;
}

/** 変更1項目（変更前 → 変更後）。 */
export interface HistoryFieldChange {
  label: string;
  before: string;
  after: string;
}

/** タイムラインに並べる履歴1件。 */
export interface HistoryTimelineEntry {
  id: number;
  /** 操作種別の表示名（登録 / 訂正 / 削除 など）。 */
  actionLabel: string;
  /** 変更日時の表示文字列（整形済み）。 */
  occurredAt: string;
  /** 対象をひと言で表す要約（任意）。 */
  summary?: string;
  changes: readonly HistoryFieldChange[];
}

/** 値が無い側に出すプレースホルダ。 */
export const EMPTY_HISTORY_VALUE = "―";

/**
 * 前後スナップショットから差分行を作る。
 * - 登録（before が null）: 全項目を「― → 値」で出す
 * - 削除（after が null）: 全項目を「値 → ―」で出す
 * - 訂正（両方ある）: 値が変わった項目だけを出す
 */
export const buildHistoryChanges = (
  before: readonly HistoryFieldValue[] | null,
  after: readonly HistoryFieldValue[] | null,
): HistoryFieldChange[] => {
  if (!before && !after) return [];
  if (!before) {
    return (after ?? []).map((field) => ({
      label: field.label,
      before: EMPTY_HISTORY_VALUE,
      after: field.value,
    }));
  }
  if (!after) {
    return before.map((field) => ({
      label: field.label,
      before: field.value,
      after: EMPTY_HISTORY_VALUE,
    }));
  }
  const beforeByLabel = new Map(before.map((field) => [field.label, field.value]));
  const changes: HistoryFieldChange[] = [];
  for (const field of after) {
    const beforeValue = beforeByLabel.get(field.label) ?? EMPTY_HISTORY_VALUE;
    if (beforeValue !== field.value) {
      changes.push({ label: field.label, before: beforeValue, after: field.value });
    }
    beforeByLabel.delete(field.label);
  }
  // 変更後には無い項目（通常は起きない）も、消えたことが分かるよう出す。
  for (const [label, value] of beforeByLabel) {
    changes.push({ label, before: value, after: EMPTY_HISTORY_VALUE });
  }
  return changes;
};

const historyActionLabels = {
  created: "登録",
  updated: "訂正",
  deleted: "削除",
} as const satisfies Record<HistoryAction, string>;

/** 操作種別の表示名。 */
export const historyActionLabel = (action: HistoryAction): string => historyActionLabels[action];

/** ISO日時文字列を表示用（日本時間）に整形する。解釈できなければそのまま返す。 */
export const formatHistoryDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};
