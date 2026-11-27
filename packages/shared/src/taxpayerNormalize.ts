/**
 * taxpayerNormalize.ts — XTX生成の境界での納税者情報の正規化と完全性検証。
 *
 * 所得税（xtx.ts）と消費税（xtxShohi.ts）のどちらの生成でも、IT部に
 * 入る納税者情報は必ずここを通す。表記ゆれ（ひらがな・半角カナの
 * フリガナ、ハイフン入りの郵便番号・電話番号、全角空白）は決定的に
 * 正規化し、必須項目が欠けたり形式が不正だったりすれば、不足・不備の
 * 項目をすべて挙げて例外を投げる。欠けたまま部分的なXTXを出すことは
 * 決してしない（2026-11-19、消費税申告書の記載漏れ確認をきっかけに
 * 恒常対策として追加）。
 */
import { XtxTaxpayer } from "./xtx";
import { parseIsoDate } from "./inputValues";

/** XTX生成時に納税者情報とあわせて検証する、申告書ごとの日付・区分。 */
export interface XtxFilingContext {
  /** 提出年月日 "2026-11-15" */
  submissionDate: string;
  /** 課税期間の開始日 "2025-01-01"。課税期間を持たない手続では null */
  periodFrom: string | null;
  /** 課税期間の終了日 "2025-12-31"。課税期間を持たない手続では null */
  periodTo: string | null;
  /** 申告区分コード。区分が申告書側の入力で決まらない手続では null */
  filingKind: number | null;
}

/** フリガナに使える文字（全角カタカナ・長音・中点・繰り返し記号）。 */
const KATAKANA_ONLY = /^[ァ-ヶー・ヽヾ]+$/;

/** 連続する空白（全角含む）を半角スペース1つに寄せ、前後を落とす。 */
function normalizeInlineSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 数字だけを取り出す。全角数字は半角に寄せてから判定する。 */
function digitsOnly(value: string): string {
  return value.normalize("NFKC").replace(/\D/g, "");
}

/**
 * フリガナを全角カタカナに正規化する。半角カタカナは NFKC で全角化し
 * （濁点・半濁点の合成も NFKC が行う）、ひらがなはカタカナに変換する。
 * 空白は取り除く（フリガナ欄に空白は置かない）。
 */
export function normalizeNameKana(value: string): string {
  const wide = value.normalize("NFKC");
  // 変換範囲は ァ行のひらがな（ぁ-ゖ）と繰り返し記号（ゝゞ）に限る。
  // ゛（U+309B）・゜（U+309C）まで含めると +0x60 で ・（U+30FB）・
  // ー（U+30FC）に化けてしまうため含めない。
  const katakana = wide.replace(/[ぁ-ゖゝゞ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
  return katakana.replace(/\s/g, "");
}

/**
 * 電話番号をハイフン区切りの3要素に正規化する。区切りなしの数字列は
 * 携帯11桁なら 3-4-4、市外局番つき10桁なら 4-2-4 に分ける
 * （xtx.ts の phoneXml と同じ分け方）。3要素にできず、合計が10桁・
 * 11桁にならない入力は空文字を返し、検証側で不備として扱う。
 */
export function normalizePhoneNumber(value: string): string {
  const normalized = value.normalize("NFKC");
  const groups = normalized.split("-").map((part) => part.replace(/\D/g, ""));
  let parts: string[] = [];
  if (groups.length === 3 && groups.every((g) => g !== "")) {
    parts = groups;
  } else {
    const digits = normalized.replace(/\D/g, "");
    if (digits.length === 11) {
      parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
    } else if (digits.length === 10) {
      parts = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6)];
    }
  }
  const total = parts.join("").length;
  if (parts.length !== 3 || (total !== 10 && total !== 11)) return "";
  // 各要素の桁数も検証する（先頭は 0 始まり、末尾は4桁、中間は2〜4桁）
  const [first, middle, last] = parts as [string, string, string];
  if (!first.startsWith("0") || first.length < 2 || first.length > 5) return "";
  if (middle.length < 2 || middle.length > 4) return "";
  if (last.length !== 4) return "";
  return parts.join("-");
}

/** "YYYY-MM-DD" 形式で、実在する日付か。 */
function isValidIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

/**
 * 納税者情報を正規化し、XTXのIT部に必須の項目がすべて揃っているか検証する。
 * 問題が1つでもあれば、不足・不備の項目をすべて挙げた例外を投げる。
 * 戻り値は正規化済みの納税者情報（入力は変更しない）。
 */
export function normalizeXtxTaxpayer(
  taxpayer: XtxTaxpayer,
  context: XtxFilingContext,
): XtxTaxpayer {
  const normalized: XtxTaxpayer = {
    name: normalizeInlineSpaces(taxpayer.name),
    nameKana: normalizeNameKana(taxpayer.nameKana),
    zipCode: digitsOnly(taxpayer.zipCode),
    address: normalizeInlineSpaces(taxpayer.address),
    addressLine2: normalizeInlineSpaces(taxpayer.addressLine2),
    birthDate: taxpayer.birthDate.trim(),
    phone: normalizePhoneNumber(taxpayer.phone),
    taxOfficeName: normalizeInlineSpaces(taxpayer.taxOfficeName),
    taxOfficeCode: digitsOnly(taxpayer.taxOfficeCode),
    myNumber: digitsOnly(taxpayer.myNumber),
    userId: digitsOnly(taxpayer.userId),
    occupation: normalizeInlineSpaces(taxpayer.occupation),
    shopName: normalizeInlineSpaces(taxpayer.shopName),
    jan1Address: normalizeInlineSpaces(taxpayer.jan1Address),
  };

  const problems: string[] = [];
  if (!normalized.name) problems.push("氏名");
  if (!normalized.nameKana) {
    problems.push("フリガナ");
  } else if (!KATAKANA_ONLY.test(normalized.nameKana)) {
    problems.push("フリガナ（全角カタカナで入力してください）");
  }
  if (normalized.zipCode.length !== 7) {
    problems.push("郵便番号（7桁で入力してください）");
  }
  if (!normalized.address) problems.push("住所");
  if (!normalized.phone) {
    problems.push("電話番号（10桁または11桁で入力してください）");
  }
  if (!normalized.taxOfficeName) problems.push("税務署名");
  if (normalized.taxOfficeCode.length !== 5) {
    problems.push("税務署コード（5桁で入力してください）");
  }
  if (normalized.userId.length !== 16) {
    problems.push("利用者識別番号（16桁で入力してください）");
  }
  if (normalized.myNumber && normalized.myNumber.length !== 12) {
    problems.push("個人番号（12桁で入力してください）");
  }
  if (normalized.birthDate && !isValidIsoDate(normalized.birthDate)) {
    problems.push("生年月日（YYYY-MM-DD形式で入力してください）");
  }
  if (!isValidIsoDate(context.submissionDate)) {
    problems.push("提出日（YYYY-MM-DD形式で入力してください）");
  }
  if (context.periodFrom !== null && !isValidIsoDate(context.periodFrom)) {
    problems.push("課税期間開始日（YYYY-MM-DD形式で入力してください）");
  }
  if (context.periodTo !== null && !isValidIsoDate(context.periodTo)) {
    problems.push("課税期間終了日（YYYY-MM-DD形式で入力してください）");
  }
  if (
    context.periodFrom !== null &&
    context.periodTo !== null &&
    isValidIsoDate(context.periodFrom) &&
    isValidIsoDate(context.periodTo) &&
    context.periodFrom > context.periodTo
  ) {
    problems.push("課税期間（開始日が終了日より後になっています）");
  }
  if (context.filingKind !== null && context.filingKind !== 1 && context.filingKind !== 3) {
    problems.push("申告区分（1=確定・3=修正確定で入力してください）");
  }
  if (problems.length > 0) {
    throw new Error(
      `XTX出力に必要な納税者情報に不足・不備があります: ${problems.join("、")}（納税者情報で入力・確認してください）`,
    );
  }
  return normalized;
}
