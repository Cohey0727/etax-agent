/**
 * taxpayerData.ts — 納税者プロフィール（年度別）の読み書き。
 *
 * 保存先はサーバーのDB（年度別に1件）。対象年の保存が無ければ、直近の
 * 過去年のプロフィールを「引き継ぎ」として返す（引き継ぎの判定はサーバー
 * 側で行い、carried_from で知らせる）。保存は常に対象年に対して行う。
 * 納税者情報の編集欄と、提出・消費税・開業届の各パネルは taxpayerProfileStore の
 * 同じ値を読むので、編集はそのまま出力に使われる。
 */
import { XtxTaxpayerInput, fetchTaxpayerProfileResult, saveTaxpayerProfile } from "@/api";
import { YearInputLoadResult, createYearInputStore } from "../yearInputStore";

/** 入力が止まってからDBへ保存するまでの待ち時間（ミリ秒）。 */
const SAVE_DELAY_MS = 600;

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

async function loadFromServer(
  _userId: number | null,
  year: number,
): Promise<YearInputLoadResult<LoadedTaxpayer>> {
  const result = await fetchTaxpayerProfileResult(year);
  if (result.kind !== "saved") return { kind: "failed" };
  return {
    kind: "loaded",
    value: {
      taxpayer: { ...emptyTaxpayer(), ...result.value.taxpayer },
      carriedFrom: result.value.carried_from,
    },
  };
}

export const taxpayerProfileStore = createYearInputStore<LoadedTaxpayer>({
  load: loadFromServer,
  save: (_userId, year, value) => saveTaxpayerProfile(year, value.taxpayer),
  saveDelayMs: SAVE_DELAY_MS,
});

/** 今日の日付（ローカル）を YYYY-MM-DD で返す。 */
export function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
