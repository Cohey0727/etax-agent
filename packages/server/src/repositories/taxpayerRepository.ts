/**
 * taxpayerRepository.ts — 納税者プロフィールテーブルへのデータアクセス（repositories）。
 *
 * プロフィールは年度ごとに1行。対象年の行が無ければ、直近の過去年の行を
 * 「引き継ぎ」として読む（保存は常に対象年に対して行う）。行 → API 形式
 * （snake_case）への変換もここで行う。
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { Db } from "../lib/db";
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
    occupation: "",
    shop_name: "",
    jan1_address: "",
    invoice_number: "",
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
    my_number: row.myNumber,
    occupation: row.occupation,
    shop_name: row.shopName,
    jan1_address: row.jan1Address,
    invoice_number: row.invoiceNumber,
  };
}

/** 対象年のプロフィール行を取得する。無ければ undefined。 */
export async function getTaxpayerProfileRow(
  db: Db,
  year: number,
): Promise<TaxpayerProfileRow | undefined> {
  const [row] = await db
    .select()
    .from(taxpayerProfilesTable)
    .where(eq(taxpayerProfilesTable.year, year));
  return row;
}

/** 引き継ぎ元になる直近の過去年の行を取得する。無ければ undefined。 */
export async function findTaxpayerCarryRow(
  db: Db,
  year: number,
): Promise<TaxpayerProfileRow | undefined> {
  const [row] = await db
    .select()
    .from(taxpayerProfilesTable)
    .where(
      and(
        lt(taxpayerProfilesTable.year, year),
        gte(taxpayerProfilesTable.year, year - CARRY_SEARCH_YEARS),
      ),
    )
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
    name: profile.name,
    nameKana: profile.name_kana,
    zipCode: profile.zip_code,
    address: profile.address,
    addressLine2: profile.address_line2,
    birthDate: profile.birth_date,
    phone: profile.phone,
    taxOfficeName: profile.tax_office_name,
    taxOfficeCode: profile.tax_office_code,
    myNumber: profile.my_number,
    occupation: profile.occupation,
    shopName: profile.shop_name,
    jan1Address: profile.jan1_address,
    invoiceNumber: profile.invoice_number,
    updatedAt: new Date(),
  };
  const { year: _year, ...updates } = values;
  const [row] = await db
    .insert(taxpayerProfilesTable)
    .values(values)
    .onConflictDoUpdate({ target: taxpayerProfilesTable.year, set: updates })
    .returning();
  return row;
}
