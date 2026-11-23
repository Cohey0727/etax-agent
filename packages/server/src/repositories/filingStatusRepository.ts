/**
 * filingStatusRepository.ts — 申告ステータステーブルへのデータアクセス（repositories）。
 *
 * 状態は「済ませた日時」で持ち、null が未了を表す。行 → API 形式への
 * 変換もここで行う（boolean は日時の有無から導く）。
 */
import { asc } from "drizzle-orm";
import { Db } from "../lib/db";
import { ownerIdForWrite } from "../lib/tenantContext";
import { FilingStatusResponse } from "../schemas/filingStatus";
import { FilingStatusRow, filingStatusTable } from "./schema";

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function filingStatusToApi(row: FilingStatusRow): FilingStatusResponse {
  return {
    year: row.year,
    confirmed: row.confirmedAt !== null,
    confirmed_at: row.confirmedAt?.toISOString() ?? null,
    calculated: row.calculatedAt !== null,
    calculated_at: row.calculatedAt?.toISOString() ?? null,
    submitted: row.submittedAt !== null,
    submitted_at: row.submittedAt?.toISOString() ?? null,
  };
}

/** 全年度の申告ステータスを年の昇順で取得する。 */
export async function listFilingStatusRows(db: Db): Promise<FilingStatusRow[]> {
  return db.select().from(filingStatusTable).orderBy(asc(filingStatusTable.year));
}

export interface FilingStatusPatch {
  confirmed?: boolean;
  calculated?: boolean;
  submitted?: boolean;
}

/**
 * 年度の申告ステータスを作成または部分更新し、結果の行を返す。
 * patch で指定された状態だけを書き換える（true で現在日時、false で null）。
 */
export async function upsertFilingStatusRow(
  db: Db,
  year: number,
  patch: FilingStatusPatch,
): Promise<FilingStatusRow | undefined> {
  const now = new Date();
  const [row] = await db
    .insert(filingStatusTable)
    .values({
      year,
      ownerUserId: ownerIdForWrite(),
      confirmedAt: patch.confirmed ? now : null,
      calculatedAt: patch.calculated ? now : null,
      submittedAt: patch.submitted ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [filingStatusTable.ownerUserId, filingStatusTable.year],
      set: {
        ...(patch.confirmed !== undefined ? { confirmedAt: patch.confirmed ? now : null } : {}),
        ...(patch.calculated !== undefined
          ? { calculatedAt: patch.calculated ? now : null }
          : {}),
        ...(patch.submitted !== undefined ? { submittedAt: patch.submitted ? now : null } : {}),
        updatedAt: now,
      },
    })
    .returning();
  return row;
}
