/**
 * receiptRepository.ts — 証憑（領収書画像）と取引の紐付け（repositories）。
 *
 * 画像そのものはストレージにあり、本テーブルはファイルID・解析結果・
 * 紐付け先の取引を持つ。解析のたびに fileId で upsert し、紐付けは
 * link / unlink で付け替える。行 → API 形式への変換もここで行う。
 */
import { and, desc, eq } from "drizzle-orm";
import { Db, DbOrTx } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
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

/** fileId の行を所有者を問わず取得する（所有権判定専用。通常の読み取りには使わない）。 */
async function getReceiptRowByFileIdUnscoped(
  db: DbOrTx,
  fileId: string,
): Promise<ReceiptRow | null> {
  const rows = await db.select().from(receiptsTable).where(eq(receiptsTable.fileId, fileId));
  return rows[0] ?? null;
}

/**
 * その fileId を現在のテナントが扱えるか。他テナントの証憑は存在しない
 * ものとして扱う（IDOR 防止）。文脈が無い（認証オフ）場合は常に対象。
 */
function isReceiptAccessible(row: ReceiptRow): boolean {
  const owner = currentUserId();
  return owner === undefined || row.ownerUserId === owner;
}

/** 解析結果を fileId で upsert する（紐付けは保持する）。 */
export async function upsertReceiptExtraction(
  db: Db,
  fileId: string,
  mimeType: string,
  extracted: AnalyzeReceiptResponse,
): Promise<ReceiptRow | null> {
  const existing = await getReceiptRowByFileIdUnscoped(db, fileId);
  if (existing) {
    // 他テナントの証憑は上書きしない（解析結果の横取り・改竄を防ぐ）。
    if (!isReceiptAccessible(existing)) return null;
    const updated = await db
      .update(receiptsTable)
      .set({ mimeType, extracted, updatedAt: new Date() })
      .where(eq(receiptsTable.fileId, fileId))
      .returning();
    return updated[0] ?? null;
  }
  const inserted = await db
    .insert(receiptsTable)
    .values({ fileId, mimeType, extracted, ownerUserId: ownerIdForWrite() })
    .returning();
  return inserted[0] ?? null;
}

export async function getReceiptRowByFileId(db: Db, fileId: string): Promise<ReceiptRow | null> {
  const row = await getReceiptRowByFileIdUnscoped(db, fileId);
  if (!row || !isReceiptAccessible(row)) return null;
  return row;
}

export async function listReceiptRows(db: Db): Promise<ReceiptRow[]> {
  const owner = currentUserId();
  const query = db.select().from(receiptsTable);
  const scoped = owner !== undefined
    ? query.where(eq(receiptsTable.ownerUserId, owner))
    : query;
  return scoped.orderBy(desc(receiptsTable.createdAt));
}

export async function listReceiptRowsForTransaction(
  db: Db,
  transactionId: number,
): Promise<ReceiptRow[]> {
  const owner = currentUserId();
  const conditions = [eq(receiptsTable.transactionId, transactionId)];
  if (owner !== undefined) conditions.push(eq(receiptsTable.ownerUserId, owner));
  return db
    .select()
    .from(receiptsTable)
    .where(and(...conditions))
    .orderBy(desc(receiptsTable.createdAt));
}

/**
 * 証憑を取引へ紐付ける。証憑レコードが無ければ作る
 * （Base64 経路など解析を経ていない fileId でも紐付けられるように）。
 */
export async function linkReceiptRow(
  db: DbOrTx,
  fileId: string,
  transactionId: number,
): Promise<ReceiptRow | null> {
  const existing = await getReceiptRowByFileIdUnscoped(db, fileId);
  if (!existing) {
    const inserted = await db
      .insert(receiptsTable)
      .values({ fileId, transactionId, ownerUserId: ownerIdForWrite() })
      .returning();
    return inserted[0] ?? null;
  }
  // 他テナントの証憑は紐付け直さない。
  if (!isReceiptAccessible(existing)) return null;
  const updated = await db
    .update(receiptsTable)
    .set({ transactionId, updatedAt: new Date() })
    .where(eq(receiptsTable.fileId, fileId))
    .returning();
  return updated[0] ?? null;
}

/** 紐付けを外す。証憑レコードが無ければ null。他テナントの証憑も null。 */
export async function unlinkReceiptRow(db: Db, fileId: string): Promise<ReceiptRow | null> {
  const existing = await getReceiptRowByFileIdUnscoped(db, fileId);
  if (!existing || !isReceiptAccessible(existing)) return null;
  const updated = await db
    .update(receiptsTable)
    .set({ transactionId: null, updatedAt: new Date() })
    .where(eq(receiptsTable.fileId, fileId))
    .returning();
  return updated[0] ?? null;
}
