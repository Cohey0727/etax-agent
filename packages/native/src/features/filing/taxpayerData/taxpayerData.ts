/**
 * taxpayerData.ts — 納税者プロフィール（年度別）の読み書き。
 *
 * 保存先はサーバーのDB（年度別に1件）。対象年の保存が無ければ、直近の
 * 過去年のプロフィールを「引き継ぎ」として返す（引き継ぎの判定はサーバー
 * 側で行い、carried_from で知らせる）。保存は常に対象年に対して行う。
 */
import { XtxTaxpayerInput, fetchTaxpayerProfile, saveTaxpayerProfile } from "@/api";

/** 空の納税者プロフィール。 */
export function emptyTaxpayer(): XtxTaxpayerInput {
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

export interface LoadedTaxpayer {
  taxpayer: XtxTaxpayerInput;
  /** 引き継ぎ元の年。対象年自身の保存を読んだ場合は null。 */
  carriedFrom: number | null;
}

/** 対象年のプロフィールを読み込む。無ければ過去年からの引き継ぎ。 */
export async function loadTaxpayer(year: number): Promise<LoadedTaxpayer> {
  const remote = await fetchTaxpayerProfile(year).catch(() => null);
  if (remote) {
    return { taxpayer: { ...emptyTaxpayer(), ...remote.taxpayer }, carriedFrom: remote.carried_from };
  }
  return { taxpayer: emptyTaxpayer(), carriedFrom: null };
}

/** 対象年のプロフィールとしてDBへ保存する。 */
export async function saveTaxpayer(year: number, taxpayer: XtxTaxpayerInput): Promise<void> {
  await saveTaxpayerProfile(year, taxpayer);
}

/** 今日の日付（ローカル）を YYYY-MM-DD で返す。 */
export function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
