/**
 * taxpayerRepository.ts — 納税者プロフィールテーブルへのデータアクセス（repositories）。
 *
 * プロフィールは年度ごとに1行。対象年の行が無ければ、直近の過去年の行を
 * 「引き継ぎ」として読む（保存は常に対象年に対して行う）。行 → API 形式
 * （snake_case）への変換もここで行う。
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Db } from "../lib/db";
import { decryptField, encryptField } from "../lib/encryption";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import { TaxpayerProfile } from "../schemas/taxpayer";
import { TaxpayerProfileRow, taxpayerProfilesTable } from "./schema";

/** 引き継ぎ元を探す過去年の範囲。 */
const CARRY_SEARCH_YEARS = 10;

/** 空のプロフィール（未保存の年の既定値）。 */
export function emptyTaxpayerProfile(): TaxpayerProfile {
  return {
    name: "",
    name_kana: "",
    zip_code: "",
    address: "",
    address_line2: "",
    birth_date: "",
    phone: "",
    tax_office_name: "",
    tax_office_code: "",
    my_number: "",
    user_id: "",
    occupation: "",
    shop_name: "",
    jan1_address: "",
    invoice_number: "",
    previous_zip_code: "",
    previous_address: "",
  };
}

/** DB行を API レスポンス形式（snake_case）に変換する。 */
export function taxpayerProfileToApi(row: TaxpayerProfileRow): TaxpayerProfile {
  return {
    name: row.name,
    name_kana: row.nameKana,
    zip_code: row.zipCode,
    address: row.address,
    address_line2: row.addressLine2,
    birth_date: row.birthDate,
    phone: row.phone,
    tax_office_name: row.taxOfficeName,
    tax_office_code: row.taxOfficeCode,
    my_number: decryptField(row.myNumber),
    user_id: decryptField(row.userId),
    occupation: row.occupation,
    shop_name: row.shopName,
    jan1_address: row.jan1Address,
    invoice_number: row.invoiceNumber,
    previous_zip_code: row.previousZipCode,
    previous_address: row.previousAddress,
  };
}

/** 対象年のプロフィール行を取得する。無ければ undefined。 */
export async function getTaxpayerProfileRow(
  db: Db,
  year: number,
): Promise<TaxpayerProfileRow | undefined> {
  const owner = currentUserId();
  const conditions = [eq(taxpayerProfilesTable.year, year)];
  if (owner !== undefined) conditions.push(eq(taxpayerProfilesTable.ownerUserId, owner));
  const [row] = await db
    .select()
    .from(taxpayerProfilesTable)
    .where(and(...conditions));
  return row;
}

/** 引き継ぎ元になる直近の過去年の行を取得する。無ければ undefined。 */
export async function findTaxpayerCarryRow(
  db: Db,
  year: number,
): Promise<TaxpayerProfileRow | undefined> {
  const owner = currentUserId();
  const conditions = [
    lt(taxpayerProfilesTable.year, year),
    gte(taxpayerProfilesTable.year, year - CARRY_SEARCH_YEARS),
  ];
  if (owner !== undefined) conditions.push(eq(taxpayerProfilesTable.ownerUserId, owner));
  const [row] = await db
    .select()
    .from(taxpayerProfilesTable)
    .where(and(...conditions))
    .orderBy(desc(taxpayerProfilesTable.year))
    .limit(1);
  return row;
}

/** 対象年のプロフィールを保存（作成または全項目の更新）し、結果の行を返す。 */
export async function upsertTaxpayerProfileRow(
  db: Db,
  year: number,
  profile: TaxpayerProfile,
): Promise<TaxpayerProfileRow | undefined> {
  const values = {
    year,
    ownerUserId: ownerIdForWrite(),
    name: profile.name,
    nameKana: profile.name_kana,
    zipCode: profile.zip_code,
    address: profile.address,
    addressLine2: profile.address_line2,
    birthDate: profile.birth_date,
    phone: profile.phone,
    taxOfficeName: profile.tax_office_name,
    taxOfficeCode: profile.tax_office_code,
    myNumber: encryptField(profile.my_number),
    userId: encryptField(profile.user_id),
    occupation: profile.occupation,
    shopName: profile.shop_name,
    jan1Address: profile.jan1_address,
    invoiceNumber: profile.invoice_number,
    previousZipCode: profile.previous_zip_code,
    previousAddress: profile.previous_address,
    updatedAt: new Date(),
  };
  const { year: _year, ownerUserId: _owner, ...updates } = values;
  const [row] = await db
    .insert(taxpayerProfilesTable)
    .values(values)
    .onConflictDoUpdate({
      target: [taxpayerProfilesTable.ownerUserId, taxpayerProfilesTable.year],
      set: updates,
    })
    .returning();
  return row;
}
