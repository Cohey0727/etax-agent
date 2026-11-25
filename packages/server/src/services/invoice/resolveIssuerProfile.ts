/**
 * resolveIssuerProfile.ts — 発行者情報の元になる納税者プロフィールの解決（services/invoice）。
 *
 * 帳票の発行年のプロフィールを読み、無ければ直近の過去年からの引き継ぎ、
 * それも無ければ空のプロフィールを返す（getTaxpayerProfile と同じ規則）。
 */
import { Db } from "../../lib/db";
import {
  emptyTaxpayerProfile,
  findTaxpayerCarryRow,
  getTaxpayerProfileRow,
  taxpayerProfileToApi,
} from "../../repositories/taxpayerRepository";
import { TaxpayerProfile } from "../../schemas/taxpayer";

export async function resolveIssuerProfile(db: Db, year: number): Promise<TaxpayerProfile> {
  const own = await getTaxpayerProfileRow(db, year);
  if (own) return taxpayerProfileToApi(own);
  const carry = await findTaxpayerCarryRow(db, year);
  if (carry) return taxpayerProfileToApi(carry);
  return emptyTaxpayerProfile();
}
