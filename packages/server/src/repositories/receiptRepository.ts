/**
 * receiptRepository.ts — 証憑（領収書画像）と取引の紐付け（repositories）。
 *
 * 画像そのものはストレージにあり、本テーブルはファイルID・解析結果・
 * 紐付け先の取引を持つ。解析のたびに fileId で upsert し、紐付けは
 * link / unlink で付け替える。行 → API 形式への変換もここで行う。
 */
import { desc, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { AnalyzeReceiptResponse, ReceiptResponse } from "../schemas/receipt";
import { ReceiptRow, receiptsTable } from "./schema";

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function receiptToApi(row: ReceiptRow): ReceiptResponse {
  return {
    id: row.id,
    file_id: row.fileId,
    mime_type: row.mimeType,
    extracted: (row.extracted as AnalyzeReceiptResponse | null) ?? null,
    transaction_id: row.transactionId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** 解析結果を fileId で upsert する（紐付けは保持する）。 */
export async function upsertReceiptExtraction(
  db: Db,
  fileId: string,
  mimeType: string,
  extracted: AnalyzeReceiptResponse,
): Promise<ReceiptRow | null> {
  const existing = await getReceiptRowByFileId(db, fileId);
  if (existing) {
    const updated = await db
      .update(receiptsTable)
      .set({ mimeType, extracted, updatedAt: new Date() })
      .where(eq(receiptsTable.fileId, fileId))
      .returning();
    return updated[0] ?? null;
  }
  const inserted = await db
    .insert(receiptsTable)
    .values({ fileId, mimeType, extracted })
    .returning();
  return inserted[0] ?? null;
}

export async function getReceiptRowByFileId(db: Db, fileId: string): Promise<ReceiptRow | null> {
  const rows = await db.select().from(receiptsTable).where(eq(receiptsTable.fileId, fileId));
  return rows[0] ?? null;
}

export async function listReceiptRows(db: Db): Promise<ReceiptRow[]> {
  return db.select().from(receiptsTable).orderBy(desc(receiptsTable.createdAt));
}

export async function listReceiptRowsForTransaction(
  db: Db,
  transactionId: number,
): Promise<ReceiptRow[]> {
  return db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.transactionId, transactionId))
    .orderBy(desc(receiptsTable.createdAt));
}

/**
 * 証憑を取引へ紐付ける。証憑レコードが無ければ作る
 * （Base64 経路など解析を経ていない fileId でも紐付けられるように）。
 */
export async function linkReceiptRow(
  db: Db,
  fileId: string,
  transactionId: number,
): Promise<ReceiptRow | null> {
  const existing = await getReceiptRowByFileId(db, fileId);
  if (!existing) {
    const inserted = await db
      .insert(receiptsTable)
      .values({ fileId, transactionId })
      .returning();
    return inserted[0] ?? null;
  }
  const updated = await db
    .update(receiptsTable)
    .set({ transactionId, updatedAt: new Date() })
    .where(eq(receiptsTable.fileId, fileId))
    .returning();
  return updated[0] ?? null;
}

/** 紐付けを外す。証憑レコードが無ければ null。 */
export async function unlinkReceiptRow(db: Db, fileId: string): Promise<ReceiptRow | null> {
  const existing = await getReceiptRowByFileId(db, fileId);
  if (!existing) return null;
  const updated = await db
    .update(receiptsTable)
    .set({ transactionId: null, updatedAt: new Date() })
    .where(eq(receiptsTable.fileId, fileId))
    .returning();
  return updated[0] ?? null;
}
