/**
 * importDedupe.ts — 取込済み取引との重複除外（services/csvImport）。
 *
 * 同じCSVを何回取り込んでも二重計上されないよう、保存前に「既にDBにある
 * 取引」と突き合わせて新規分だけを残す。突き合わせは件数ベース（マルチ
 * セット）で行う: 同じ指紋の取引がDBに n 件あれば、取り込む側の同じ指紋は
 * n 件まで重複として除外し、超過分だけを新規として通す。これにより、
 * 同日・同額・同名の別取引（例: PayPay のギフトカードチャージの連続実行）
 * が複数件ある正規のケースでも、再取込で増えも減りもしない。
 *
 * 指紋に使うのは取り込み時点で決まる不変の項目だけ（日付・金額・摘要・
 * 口座・税区分）。勘定科目や収入区分は後から編集・分類で変わるため含めない。
 */

export interface FingerprintFields {
  date: string;
  amount: number;
  description: string;
  account: string;
  taxCategory: string;
}

/** 取引の指紋（重複判定キー）。 */
export function transactionFingerprint(fields: FingerprintFields): string {
  return [
    fields.date,
    String(fields.amount),
    fields.description,
    fields.account,
    fields.taxCategory,
  ].join("\u0000");
}

/** 既存取引の指紋 → 件数 の集計を作る。 */
export function buildFingerprintCounts(
  rows: readonly FingerprintFields[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = transactionFingerprint(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * 取り込む取引から、既存と重複する分を取り除く。
 * 既存件数の範囲内は重複として数え、超過分だけを fresh として返す。
 */
export function excludeAlreadyImported<T>(
  incoming: readonly T[],
  fingerprintOf: (item: T) => string,
  existingCounts: Map<string, number>,
): { fresh: T[]; duplicates: number } {
  const remaining = new Map(existingCounts);
  const fresh: T[] = [];
  let duplicates = 0;
  for (const item of incoming) {
    const key = fingerprintOf(item);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      duplicates++;
    } else {
      fresh.push(item);
    }
  }
  return { fresh, duplicates };
}
