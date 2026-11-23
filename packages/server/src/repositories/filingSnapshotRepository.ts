/**
 * filingSnapshotRepository.ts — 確定スナップショットテーブルへのデータアクセス（repositories）。
 */
import { asc, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { FilingSnapshotFigures, FilingSnapshotResponse } from "../schemas/filingSnapshot";
import { FilingSnapshotRow, filingSnapshotsTable } from "./schema";

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function filingSnapshotToApi(row: FilingSnapshotRow): FilingSnapshotResponse {
  return {
    id: row.id,
    year: row.year,
    confirmed_at: row.confirmedAt.toISOString(),
    figures: row.figures as FilingSnapshotFigures,
  };
}

/** 対象年の確定スナップショットを確定日時の昇順で取得する。 */
export async function listFilingSnapshotRows(
  db: Db,
  year: number,
): Promise<FilingSnapshotRow[]> {
  return db
    .select()
    .from(filingSnapshotsTable)
    .where(eq(filingSnapshotsTable.year, year))
    .orderBy(asc(filingSnapshotsTable.id));
}

/** 確定スナップショットを1件追加し、追加した行を返す。 */
export async function insertFilingSnapshotRow(
  db: Db,
  year: number,
  figures: FilingSnapshotFigures,
): Promise<FilingSnapshotRow> {
  const inserted = await db
    .insert(filingSnapshotsTable)
    .values({ year, figures })
    .returning();
  return inserted[0];
}
