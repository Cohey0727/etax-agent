/**
 * fixedAssetImageRepository.ts — 固定資産画像テーブルへのデータアクセス（repositories）。
 *
 * 所有者の絞り込みは固定資産側（fixedAssetRepository の getFixedAssetRow）で
 * 済ませた上で資産IDで引くのが基本経路。ファイルID単独で引く配信経路は
 * 画像行自身の所有者でも絞り、他テナントの画像を「存在しない」ものとして
 * 扱う（IDOR 対策）。
 */
import { and, asc, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import { FixedAssetImageResponse } from "../schemas/fixedAsset";
import { FixedAssetImageRow, NewFixedAssetImageRow, fixedAssetImagesTable } from "./schema";

/** DB行を API レスポンス形式（snake_case）に変換する。表示用URLは呼び出し側が付ける。 */
export function fixedAssetImageToApi(row: FixedAssetImageRow, url: string): FixedAssetImageResponse {
  return {
    id: row.id,
    asset_id: row.assetId,
    file_id: row.fileId,
    mime_type: row.mimeType,
    url,
    created_at: row.createdAt.toISOString(),
  };
}

export async function listFixedAssetImageRows(
  db: Db,
  assetId: number,
): Promise<FixedAssetImageRow[]> {
  return db
    .select()
    .from(fixedAssetImagesTable)
    .where(eq(fixedAssetImagesTable.assetId, assetId))
    .orderBy(asc(fixedAssetImagesTable.id));
}

export async function insertFixedAssetImageRow(
  db: Db,
  values: Omit<NewFixedAssetImageRow, "id" | "createdAt" | "ownerUserId">,
): Promise<FixedAssetImageRow | null> {
  const inserted = await db
    .insert(fixedAssetImagesTable)
    .values({ ...values, ownerUserId: ownerIdForWrite() })
    .returning();
  return inserted[0] ?? null;
}

/** ファイルIDで画像行を引く。テナント文脈がある場合は自テナントの行だけ。 */
export async function getFixedAssetImageRowByFileId(
  db: Db,
  fileId: string,
): Promise<FixedAssetImageRow | null> {
  const owner = currentUserId();
  const conditions = [eq(fixedAssetImagesTable.fileId, fileId)];
  if (owner !== undefined) conditions.push(eq(fixedAssetImagesTable.ownerUserId, owner));
  const rows = await db
    .select()
    .from(fixedAssetImagesTable)
    .where(and(...conditions));
  return rows[0] ?? null;
}

export async function deleteFixedAssetImageRow(
  db: Db,
  assetId: number,
  fileId: string,
): Promise<FixedAssetImageRow | null> {
  const deleted = await db
    .delete(fixedAssetImagesTable)
    .where(
      and(
        eq(fixedAssetImagesTable.assetId, assetId),
        eq(fixedAssetImagesTable.fileId, fileId),
      ),
    )
    .returning();
  return deleted[0] ?? null;
}
