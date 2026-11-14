/**
 * taxpayerStorage.ts — 納税者情報（XTX出力用）を端末へ保存する。
 * 年度に依らない情報なのでキーは1つ。個人番号も含むため、保存先は
 * この端末の localStorage のみで、サーバーへは出力リクエスト時にだけ送る。
 * 保存値が壊れていても空の入力にフォールバックする。
 */
import { XtxTaxpayerInput } from "@types";

const STORAGE_KEY = "etax-taxpayer";

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
    occupation: "",
    shop_name: "",
    jan1_address: "",
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function loadTaxpayer(): XtxTaxpayerInput {
  const base = emptyTaxpayer();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      name: str(parsed.name),
      name_kana: str(parsed.name_kana),
      zip_code: str(parsed.zip_code),
      address: str(parsed.address),
      address_line2: str(parsed.address_line2),
      birth_date: str(parsed.birth_date),
      phone: str(parsed.phone),
      tax_office_name: str(parsed.tax_office_name),
      tax_office_code: str(parsed.tax_office_code),
      my_number: str(parsed.my_number),
      occupation: str(parsed.occupation),
      shop_name: str(parsed.shop_name),
      jan1_address: str(parsed.jan1_address),
    };
  } catch {
    return base;
  }
}

export function saveTaxpayer(taxpayer: XtxTaxpayerInput): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(taxpayer));
  } catch {
    // 保存できない環境ではそのまま編集を続ける。
  }
}
