/**
 * taxpayerStorage.ts — 納税者プロフィール（年度別）の読み書き。
 *
 * 保存先はサーバーのDB（年度別に1件）。対象年の保存が無ければ、直近の
 * 過去年のプロフィールを「引き継ぎ」として返す（引き継ぎの判定はサーバー
 * 側で行い、carried_from で知らせる）。保存は常に対象年に対して行う。
 * 移行前に端末の localStorage へ保存していた値だけが残っている場合は、
 * その値を読み込んでDBへ移し替える（移行は一度きり）。DBへ届かない
 * 場合は端末保存の値で編集を続けられるようにする。保存値が壊れていても
 * 空の入力にフォールバックする。
 */
import { XtxTaxpayerInput } from "@types";
import { fetchTaxpayerProfile, saveTaxpayerProfile } from "@utils/api";

const LEGACY_KEY = "etax-taxpayer";
const KEY_PREFIX = "etax-taxpayer-";
/** 引き継ぎ元を探す過去年の範囲（端末保存の移行用）。 */
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

function isEmptyProfile(taxpayer: XtxTaxpayerInput): boolean {
  return Object.values(taxpayer).every((value) => value === "");
}

export interface LoadedTaxpayer {
  taxpayer: XtxTaxpayerInput;
  /** 引き継ぎ元の年。対象年自身の保存を読んだ場合は null。 */
  carriedFrom: number | null;
  /** 移行前の単一キーから引き継いだ場合は true。 */
  carriedFromLegacy: boolean;
}

/** 端末保存（移行前）から読み込む。何も保存が無ければ null。 */
function loadTaxpayerFromLocal(year: number): LoadedTaxpayer | null {
  const own = readKey(`${KEY_PREFIX}${year}`);
  if (own) return { taxpayer: own, carriedFrom: null, carriedFromLegacy: false };
  for (let y = year - 1; y >= year - CARRY_SEARCH_YEARS; y--) {
    const past = readKey(`${KEY_PREFIX}${y}`);
    if (past) return { taxpayer: past, carriedFrom: y, carriedFromLegacy: false };
  }
  const legacy = readKey(LEGACY_KEY);
  if (legacy) return { taxpayer: legacy, carriedFrom: null, carriedFromLegacy: true };
  return null;
}

/** 対象年のプロフィールを読み込む。無ければ過去年からの引き継ぎ。 */
export async function loadTaxpayer(year: number): Promise<LoadedTaxpayer> {
  const remote = await fetchTaxpayerProfile(year);
  if (remote && (!isEmptyProfile(remote.taxpayer) || remote.carried_from !== null)) {
    return {
      taxpayer: remote.taxpayer,
      carriedFrom: remote.carried_from,
      carriedFromLegacy: false,
    };
  }
  const local = loadTaxpayerFromLocal(year);
  if (local && !isEmptyProfile(local.taxpayer)) {
    // 端末にだけ残っていた値をDBへ移し替える（対象年として保存する）。
    await saveTaxpayerProfile(year, local.taxpayer);
    return { taxpayer: local.taxpayer, carriedFrom: null, carriedFromLegacy: false };
  }
  if (remote) {
    return {
      taxpayer: remote.taxpayer,
      carriedFrom: remote.carried_from,
      carriedFromLegacy: false,
    };
  }
  if (local) return local;
  return { taxpayer: emptyTaxpayer(), carriedFrom: null, carriedFromLegacy: false };
}

/** 対象年のプロフィールとしてDBへ保存する。 */
export async function saveTaxpayer(year: number, taxpayer: XtxTaxpayerInput): Promise<void> {
  await saveTaxpayerProfile(year, taxpayer);
}
