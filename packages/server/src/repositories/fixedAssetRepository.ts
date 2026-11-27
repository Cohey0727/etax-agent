/**
 * fixedAssetRepository.ts — 固定資産台帳テーブルへのデータアクセス（repositories）。
 *
 * 行 → API 形式（snake_case）への変換と、shared の減価償却エンジンの
 * 入力形式（FixedAssetInput）への変換もここで行う。
 * 除却済み資産の扱い: 除却年の翌年以降は償却対象から外す。除却年の償却は
 * 除却日をエンジンに渡して除却月までの月割にする（除却時の未償却残高の
 * 必要経費算入は扱わない）。
 */
import { and, asc, eq } from "drizzle-orm";
import { DepreciationDetailRow, DepreciationMethod, FixedAssetInput, depreciationDetailRow } from "@etax/shared";
import { Db } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import { FixedAssetResponse } from "../schemas/fixedAsset";
import { FixedAssetRow, NewFixedAssetRow, fixedAssetsTable } from "./schema";

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function fixedAssetToApi(row: FixedAssetRow): FixedAssetResponse {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    income_type: row.incomeType,
    acquisition_date: row.acquisitionDate,
    service_start_date: row.serviceStartDate,
    cost: row.cost,
    useful_life_years: row.usefulLifeYears,
    method: row.method as DepreciationMethod,
    business_ratio_percent: row.businessRatioPercent,
    disposed_date: row.disposedDate,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** DB行を減価償却エンジンの入力形式に変換する。 */
export function fixedAssetToInput(row: FixedAssetRow): FixedAssetInput {
  return {
    acquisitionDate: row.acquisitionDate,
    serviceStartDate: row.serviceStartDate ?? undefined,
    cost: row.cost,
    usefulLifeYears: row.usefulLifeYears,
    method: row.method as DepreciationMethod,
    businessRatioPercent: row.businessRatioPercent,
    disposalDate: row.disposedDate ?? undefined,
  };
}

/** 指定年に償却対象になるか（除却年の翌年以降は対象外）。 */
export function isActiveInYear(row: FixedAssetRow, year: number): boolean {
  if (!row.disposedDate) return true;
  return Number(row.disposedDate.slice(0, 4)) >= year;
}

export async function listFixedAssetRows(db: Db): Promise<FixedAssetRow[]> {
  const owner = currentUserId();
  const query = db.select().from(fixedAssetsTable);
  const scoped = owner !== undefined
    ? query.where(eq(fixedAssetsTable.ownerUserId, owner))
    : query;
  return scoped.orderBy(asc(fixedAssetsTable.acquisitionDate), asc(fixedAssetsTable.id));
}

/**
 * id 指定の所有者条件。テナント文脈がある場合は自テナントの行だけに絞る
 * （他テナントの資産は「存在しない」として扱い、IDOR を塞ぐ）。
 * 文脈が無い（認証オフ）場合は id のみで引く。
 */
function fixedAssetIdCondition(id: number) {
  const owner = currentUserId();
  const conditions = [eq(fixedAssetsTable.id, id)];
  if (owner !== undefined) conditions.push(eq(fixedAssetsTable.ownerUserId, owner));
  return and(...conditions);
}

export async function getFixedAssetRow(db: Db, id: number): Promise<FixedAssetRow | null> {
  const rows = await db
    .select()
    .from(fixedAssetsTable)
    .where(fixedAssetIdCondition(id));
  return rows[0] ?? null;
}

export async function insertFixedAssetRow(
  db: Db,
  values: Omit<NewFixedAssetRow, "id" | "createdAt" | "updatedAt">,
): Promise<FixedAssetRow | null> {
  const inserted = await db
    .insert(fixedAssetsTable)
    .values({ ...values, ownerUserId: ownerIdForWrite() })
    .returning();
  return inserted[0] ?? null;
}

export async function updateFixedAssetRow(
  db: Db,
  id: number,
  values: Partial<Omit<NewFixedAssetRow, "id" | "createdAt">>,
): Promise<FixedAssetRow | null> {
  const updated = await db
    .update(fixedAssetsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(fixedAssetIdCondition(id))
    .returning();
  return updated[0] ?? null;
}

export async function deleteFixedAssetRow(db: Db, id: number): Promise<boolean> {
  const deleted = await db
    .delete(fixedAssetsTable)
    .where(fixedAssetIdCondition(id))
    .returning();
  return deleted.length > 0;
}

/**
 * 台帳の行から指定年の決算書明細行（事業・不動産・農業別）を組み立てる。
 * XTX 出力（API / MCP）が使う。その年に償却の無い資産は含まない。
 */
export function depreciationDetailRowsForYear(
  rows: FixedAssetRow[],
  year: number,
): {
  business: DepreciationDetailRow[];
  realEstate: DepreciationDetailRow[];
  agriculture: DepreciationDetailRow[];
} {
  const business: DepreciationDetailRow[] = [];
  const realEstate: DepreciationDetailRow[] = [];
  const agriculture: DepreciationDetailRow[] = [];
  for (const row of rows) {
    if (!isActiveInYear(row, year)) continue;
    const detail = depreciationDetailRow(row.name, fixedAssetToInput(row), year, row.quantity);
    if (!detail) continue;
    if (row.incomeType === "real_estate") realEstate.push(detail);
    else if (row.incomeType === "agriculture") agriculture.push(detail);
    else business.push(detail);
  }
  return { business, realEstate, agriculture };
}
