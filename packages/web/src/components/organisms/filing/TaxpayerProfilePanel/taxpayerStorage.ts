/**
 * taxpayerStorage.ts — 納税者プロフィール（年度別）の読み書き。
 *
 * 保存先はサーバーのDB（年度別に1件）。対象年の保存が無ければ、直近の
 * 過去年のプロフィールを「引き継ぎ」として返す（引き継ぎの判定はサーバー
 * 側で行い、carried_from で知らせる）。保存は常に対象年に対して行う。
 * サーバーに何も無く端末の localStorage にだけ値がある場合は、その値を
 * 対象年としてサーバーへ送る。送れた年分は印を残し、以後はサーバーの値
 * （空にした場合も含む）を正とする。保存値が壊れていても空の入力に
 * フォールバックする。
 */
import { XtxTaxpayerInput } from "@types";
import { fetchTaxpayerProfile, saveTaxpayerProfile } from "@utils/api";
import { userScopedKey } from "@utils/userStorage";

/** 年度を持たない端末保存のキー。 */
const UNDATED_KEY = "etax-taxpayer";
const KEY_PREFIX = "etax-taxpayer-";
/** 端末の値をサーバーへ送った年分の印。 */
const SENT_KEY_PREFIX = "etax-taxpayer-sent-";
/** 端末保存の中から引き継ぎ元を探す過去年の範囲。 */
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
    user_id: "",
    occupation: "",
    shop_name: "",
    jan1_address: "",
    invoice_number: "",
    previous_zip_code: "",
    previous_address: "",
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
      user_id: str(parsed.user_id),
      occupation: str(parsed.occupation),
      shop_name: str(parsed.shop_name),
      jan1_address: str(parsed.jan1_address),
      invoice_number: str(parsed.invoice_number),
      previous_zip_code: str(parsed.previous_zip_code),
      previous_address: str(parsed.previous_address),
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
}

/** 端末保存から読み込む（対象年 → 過去年 → 年度を持たないキーの順）。何も無ければ null。 */
function loadTaxpayerFromLocal(year: number): XtxTaxpayerInput | null {
  const own = readKey(userScopedKey(`${KEY_PREFIX}${year}`));
  if (own) return own;
  for (let y = year - 1; y >= year - CARRY_SEARCH_YEARS; y--) {
    const past = readKey(userScopedKey(`${KEY_PREFIX}${y}`));
    if (past) return past;
  }
  return readKey(userScopedKey(UNDATED_KEY));
}

function sentKey(year: number): string {
  return userScopedKey(`${SENT_KEY_PREFIX}${year}`);
}

function wasSent(year: number): boolean {
  try {
    return localStorage.getItem(sentKey(year)) !== null;
  } catch {
    return false;
  }
}

function markSent(year: number): void {
  try {
    localStorage.setItem(sentKey(year), "1");
  } catch {
    // 印を残せなくても、次回もサーバーに値があればそちらが使われる。
  }
}

/**
 * 対象年のプロフィールを読み込む。無ければ過去年からの引き継ぎ。
 * サーバーから取得できなかった場合は null（空のプロフィールで上書き
 * しないよう、呼び出し側は編集・保存をさせない）。
 */
export async function loadTaxpayer(year: number): Promise<LoadedTaxpayer | null> {
  const remote = await fetchTaxpayerProfile(year);
  if (remote.status === "failed") return null;
  const fromServer: LoadedTaxpayer = {
    taxpayer: remote.value.taxpayer,
    carriedFrom: remote.value.carried_from,
  };
  if (!isEmptyProfile(fromServer.taxpayer) || fromServer.carriedFrom !== null || wasSent(year)) {
    return fromServer;
  }
  const local = loadTaxpayerFromLocal(year);
  if (!local || isEmptyProfile(local)) return fromServer;
  if (await saveTaxpayerProfile(year, local)) markSent(year);
  return { taxpayer: local, carriedFrom: null };
}
