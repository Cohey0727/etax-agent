/**
 * classificationHistoryRepository.ts — 科目判定の学習履歴の保存（repositories）。
 *
 * 過去にユーザーが確定した「摘要 → 勘定科目」の対応を蓄積し、次回以降の
 * 判定で「過去の傾向」として優先利用する。DB（SQLite）とは独立に
 * 未設定でもサーバーが動く）のため、履歴はサーバーのデータディレクトリの
 * JSONファイルに保存する（Git管理外）。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../lib/config";

export interface ClassificationHistoryRecord {
  /** 正規化した摘要（照合キー）。 */
  key: string;
  /** 元の摘要（表示・デバッグ用）。 */
  description: string;
  /** 確定した勘定科目。 */
  account: string;
  /** この対応で確定した回数。 */
  count: number;
  /** 最終確定日時（ISO文字列）。 */
  updatedAt: string;
}

const HISTORY_FILENAME = "classification-history.json";

/** 摘要の照合キーを作る（前後空白・連続空白・英字大小を吸収する）。 */
export function normalizeDescriptionKey(description: string): string {
  return description.trim().replace(/\s+/g, " ").toLowerCase();
}

function historyPath(): string {
  return join(serverDataDir(), HISTORY_FILENAME);
}

/** 学習履歴を全件読み込む。ファイルが無ければ空配列。 */
export async function loadClassificationHistory(): Promise<ClassificationHistoryRecord[]> {
  try {
    const text = await readFile(historyPath(), "utf-8");
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is ClassificationHistoryRecord =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as ClassificationHistoryRecord).key === "string" &&
        typeof (v as ClassificationHistoryRecord).account === "string",
    );
  } catch {
    return [];
  }
}

/** 確定した対応を1件記録する（同じ摘要×科目は回数を増やす）。 */
export async function recordClassification(
  description: string,
  account: string,
): Promise<ClassificationHistoryRecord[]> {
  const records = await loadClassificationHistory();
  const key = normalizeDescriptionKey(description);
  const now = new Date().toISOString();
  const existing = records.find((r) => r.key === key && r.account === account);
  if (existing) {
    existing.count += 1;
    existing.updatedAt = now;
    existing.description = description;
  } else {
    records.push({ key, description, account, count: 1, updatedAt: now });
  }
  await mkdir(serverDataDir(), { recursive: true });
  await writeFile(historyPath(), JSON.stringify(records, null, 2), "utf-8");
  return records;
}
