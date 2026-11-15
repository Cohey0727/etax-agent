/**
 * taxpayerStorage.ts — 納税者プロフィール（年度別）を端末へ保存する。
 *
 * プロフィールは年度ごとに持つ（住所・インボイス番号などが年で変わるため）。
 * 対象年の保存が無ければ、直近の過去年のプロフィールを「引き継ぎ」として
 * 読み込む（保存は対象年に対して行われる）。移行前の単一キー
 * （etax-taxpayer）も引き継ぎ元として扱う。個人番号を含むため保存先は
 * この端末の localStorage のみで、サーバーへは出力リクエスト時にだけ送る。
 * 保存値が壊れていても空の入力にフォールバックする。
 */
import { XtxTaxpayerInput } from "@types";

const LEGACY_KEY = "etax-taxpayer";
const KEY_PREFIX = "etax-taxpayer-";
/** 引き継ぎ元を探す過去年の範囲。 */
const CARRY_SEARCH_YEARS = 10;

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
    invoice_number: "",
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseStored(raw: string | null): XtxTaxpayerInput | null {
  if (!raw) return null;
  try {
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
      invoice_number: str(parsed.invoice_number),
    };
  } catch {
    return null;
  }
}

function readKey(key: string): XtxTaxpayerInput | null {
  try {
    return parseStored(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export interface LoadedTaxpayer {
  taxpayer: XtxTaxpayerInput;
  /** 引き継ぎ元の年。対象年自身の保存を読んだ場合は null。 */
  carriedFrom: number | null;
  /** 移行前の単一キーから引き継いだ場合は true。 */
  carriedFromLegacy: boolean;
}

/** 対象年のプロフィールを読み込む。無ければ過去年→旧キーの順に引き継ぐ。 */
export function loadTaxpayer(year: number): LoadedTaxpayer {
  const own = readKey(`${KEY_PREFIX}${year}`);
  if (own) return { taxpayer: own, carriedFrom: null, carriedFromLegacy: false };
  for (let y = year - 1; y >= year - CARRY_SEARCH_YEARS; y--) {
    const past = readKey(`${KEY_PREFIX}${y}`);
    if (past) return { taxpayer: past, carriedFrom: y, carriedFromLegacy: false };
  }
  const legacy = readKey(LEGACY_KEY);
  if (legacy) return { taxpayer: legacy, carriedFrom: null, carriedFromLegacy: true };
  return { taxpayer: emptyTaxpayer(), carriedFrom: null, carriedFromLegacy: false };
}

/** 対象年のプロフィールとして保存する。 */
export function saveTaxpayer(year: number, taxpayer: XtxTaxpayerInput): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${year}`, JSON.stringify(taxpayer));
  } catch {
    // 保存できない環境ではそのまま編集を続ける。
  }
}
