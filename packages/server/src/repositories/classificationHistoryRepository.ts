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
import { normalizeSearchText } from "@etax/shared";
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

/**
 * 摘要の照合キーを作る（全角半角・半角カタカナ・英字大小・空白の揺れを吸収する）。
 * 保存済みキーは形式が古い場合があるため、照合時はこの関数で摘要から
 * 作り直したキー同士で比べる（保存値そのものは信用しない）。
 */
export function normalizeDescriptionKey(description: string): string {
  return normalizeSearchText(description).trim().replace(/\s+/g, " ");
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

/** 学習履歴を保存する。 */
async function saveClassificationHistory(
  records: ClassificationHistoryRecord[],
): Promise<ClassificationHistoryRecord[]> {
  await mkdir(serverDataDir(), { recursive: true });
  await writeFile(historyPath(), JSON.stringify(records, null, 2), "utf-8");
  return records;
}

/** 摘要（正規化キー）と科目で1件を引く（照合は摘要から作り直したキーで比べる）。 */
function findRecord(
  records: ClassificationHistoryRecord[],
  description: string,
  account: string,
): ClassificationHistoryRecord | undefined {
  const key = normalizeDescriptionKey(description);
  return records.find(
    (r) => normalizeDescriptionKey(r.description) === key && r.account === account,
  );
}

/** 確定した対応を1件記録する（同じ摘要×科目は回数を増やす）。 */
export async function recordClassification(
  description: string,
  account: string,
): Promise<ClassificationHistoryRecord[]> {
  const records = await loadClassificationHistory();
  const key = normalizeDescriptionKey(description);
  const now = new Date().toISOString();
  const existing = findRecord(records, description, account);
  if (existing) {
    existing.key = key;
    existing.count += 1;
    existing.updatedAt = now;
    existing.description = description;
  } else {
    records.push({ key, description, account, count: 1, updatedAt: now });
  }
  return saveClassificationHistory(records);
}

/**
 * 学習した対応の科目を変更する（AIのメモリーの編集）。
 * 変更先の科目で同じ摘要の対応が既にあれば、回数を合算して1件にまとめる。
 * 対象が無ければ null。
 */
export async function updateClassificationAccount(
  description: string,
  account: string,
  newAccount: string,
): Promise<ClassificationHistoryRecord[] | null> {
  const records = await loadClassificationHistory();
  const target = findRecord(records, description, account);
  if (!target) return null;
  if (account === newAccount) return records;
  const mergeInto = findRecord(records, description, newAccount);
  if (mergeInto && mergeInto !== target) {
    mergeInto.count += target.count;
    mergeInto.updatedAt = new Date().toISOString();
    return saveClassificationHistory(records.filter((r) => r !== target));
  }
  target.account = newAccount;
  target.updatedAt = new Date().toISOString();
  return saveClassificationHistory(records);
}

/** 学習した対応を1件削除する（AIのメモリーの編集）。対象が無ければ null。 */
export async function deleteClassification(
  description: string,
  account: string,
): Promise<ClassificationHistoryRecord[] | null> {
  const records = await loadClassificationHistory();
  const target = findRecord(records, description, account);
  if (!target) return null;
  return saveClassificationHistory(records.filter((r) => r !== target));
}
