/**
 * filingSnapshotRepository.ts — 確定スナップショットテーブルへのデータアクセス（repositories）。
 */
import { and, asc, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
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

/** 対象年の確定スナップショットを確定日時の昇順で取得する（テナント文脈があれば所有者で絞る）。 */
export async function listFilingSnapshotRows(
  db: Db,
  year: number,
): Promise<FilingSnapshotRow[]> {
  const owner = currentUserId();
  const conditions = [eq(filingSnapshotsTable.year, year)];
  if (owner !== undefined) conditions.push(eq(filingSnapshotsTable.ownerUserId, owner));
  return db
    .select()
    .from(filingSnapshotsTable)
    .where(and(...conditions))
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
    .values({ year, figures, ownerUserId: ownerIdForWrite() })
    .returning();
  return inserted[0];
}
