/**
 * xtx.ts — e-Tax 申告等データ（XTX形式）の生成（services ではなく shared の純粋関数）。
 *
 * 国税庁が公開する e-Tax 仕様書（データ形式等に関する仕様書・XML構造設計書・
 * 帳票フィールド仕様書）に基づき、手続 RKO0010「所得税及び復興特別所得税申告」の
 * 送信データを組み立てる。含まれる帳票は次の3つ。
 *   - KOA020 所得税申告書（第一表・第二表。第五表は現行様式では第一表の
 *     「修正申告」欄に統合されている）
 *   - KOA210 青色申告決算書（一般用）
 *   - KOA220 青色申告決算書（不動産所得用）
 *
 * 様式バージョンは年分ごとに固定: KOA020 は 2023年分=21.0 / 2024年分=22.0 /
 * 2025年分=23.0、KOA210=11.0、KOA220=8.0（手続内帳票対応表の現行セット）。
 * 手続バージョンは様式バージョンとは世代が異なり、KOA020 21.0 ⇔ 手続 23.1.1 /
 * 22.0 ⇔ 24.0.1 / 23.0 ⇔ 25.0.1（手続内帳票対応表（申告）で確認済み）。
 * 手続・様式の組が対応表に存在しないデータは e-Taxソフト（WEB版）の
 * 「作成済みデータの利用」で読み込めない（SE00S170）。
 *
 * 名前空間は DATA・RKO0010 とも shotoku をデフォルト名前空間とする
 * （手続スキーマ RKO0010-231.xsd 等の定義どおり）。IT部は ITdefinition.xsd の
 * シーケンス順に要素を並べ、必須の NOZEISHA_ID（利用者識別番号）と
 * TETSUZUKI（手続コード）を必ず含める。ZEIMUSHO の子要素名は
 * gen:zeimusho_CD / gen:zeimusho_NM（先頭小文字、XSDの定義どおり）。
 * 生成物は公式 XML スキーマ（e-Tax 仕様書「19 XMLスキーマ」）で検証済み。
 *
 * 署名（XML署名）は付けない。e-Taxソフト／WEB版に組み込んだ後、納税者本人が
 * マイナンバーカードで署名して送信する前提のデータである。
 * CATALOG（管理用部分）の RDF は CATALOG.xsd が lax のため骨格のみとし、
 * FORM_SEC には様式IDを列挙する。帳票の中身は CONTENTS 側が正。
 */
import { DeductionInputs, IncomeTaxResult, MiscIncomeInput, SalaryIncomeInput, computeManualIncomes } from "./deductions";
import {
  ExpandedIncomeBreakdown,
  ExpandedIncomeInput,
  computeExpandedIncomes,
  isExpandedIncomeEmpty,
} from "./expandedIncome";
import { CorrectedFigures, FilingType } from "./taxcalc";
import {
  AGRICULTURE_BLUE_EXPENSE_CATEGORIES,
  AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES,
  AgricultureStatement,
  EMPTY_AGRICULTURE_INPUT,
  agricultureIncomeBeforeBlueDeduction,
  computeAgricultureStatement,
} from "./agriculture";
import { DepreciationDetailRow } from "./depreciation";
import { normalizeXtxTaxpayer } from "./taxpayerNormalize";

/**
 * 納税者情報（XTXのIT部と申告書見出し部に入る）。
 * 氏名・フリガナ・郵便番号・住所・電話番号・税務署（名称・コード）・
 * 利用者識別番号は必須で、生成時に taxpayerNormalize で正規化と
 * 完全性検証を通す（欠けていれば生成自体が例外で止まる）。
 * それ以外の任意項目は空文字で省略できる。
 */
export interface XtxTaxpayer {
  /** 氏名 */
  name: string;
  /** フリガナ */
  nameKana: string;
  /** 郵便番号（"7220062" または "722-0062"） */
  zipCode: string;
  /** 住所（上段） */
  address: string;
  /** 住所（下段）。なければ空文字 */
  addressLine2: string;
  /** 生年月日 "1980-04-01"。なければ空文字 */
  birthDate: string;
  /** 電話番号 "080-2500-7879"。なければ空文字 */
  phone: string;
  /** 提出先税務署名（"尾道" のように「税務署」を付けない） */
  taxOfficeName: string;
  /** 税務署コード（5桁）。なければ空文字 */
  taxOfficeCode: string;
  /** 個人番号（マイナンバー、12桁）。なければ空文字 */
  myNumber: string;
  /** 利用者識別番号（e-Tax、16桁）。IT部の必須要素 NOZEISHA_ID に入る */
  userId: string;
  /** 職業。なければ空文字 */
  occupation: string;
  /** 屋号・雅号。なければ空文字 */
  shopName: string;
  /** 1月1日の住所（現住所と違う場合のみ）。なければ空文字 */
  jan1Address: string;
}

export const EMPTY_XTX_TAXPAYER: XtxTaxpayer = {
  name: "",
  nameKana: "",
  zipCode: "",
  address: "",
  addressLine2: "",
  birthDate: "",
  phone: "",
  taxOfficeName: "",
  taxOfficeCode: "",
  myNumber: "",
  userId: "",
  occupation: "",
  shopName: "",
  jan1Address: "",
};

/** XTX生成の入力一式。数値はすべて eTaxAgent の計算結果をそのまま渡す。 */
export interface XtxFilingData {
  /** 対象年分（西暦） */
  year: number;
  /** 修正申告なら true、確定申告なら false */
  amendment: boolean;
  /** 提出年月日 "2026-11-20" */
  submissionDate: string;
  taxpayer: XtxTaxpayer;
  /** 修正後の申告数値（computeCorrectedFigures の結果） */
  figures: CorrectedFigures;
  /** 控除の入力値（第二表の保険料明細・区分判定に使う） */
  deductionInputs: DeductionInputs;
  /** 雑所得の入力（公的年金等・業務・その他）。第一表カ〜ク・⑦〜⑩に出力する。 */
  miscIncome: MiscIncomeInput;
  /** 給与所得の入力（収入金額）。第一表オ・⑥に出力する。省略時は給与なし。 */
  salaryIncome?: SalaryIncomeInput;
  /** 配当・一時・株式等譲渡の入力（Issue #27）。省略・全て空なら従来どおり。 */
  expandedIncome?: ExpandedIncomeInput;
  /**
   * 農業所得（Issue #24）。計算済みの決算書内訳と、青色申告特別控除の
   * 農業への配分額。ある場合は青色申告決算書（農業所得用）KOA240 /
   * 収支内訳書（農業所得用）KOA120 を添付する。
   */
  agriculture?: {
    statement: AgricultureStatement;
    /** 青色申告特別控除の農業への配分額（白色は0） */
    blueDeduction: number;
  };
  /** 所得税の計算結果（控除・税額控除の内訳を含む） */
  tax: IncomeTaxResult;
  /** 勘定科目別の経費合計（決算書の経費欄に振り分ける） */
  categoryTotals: {
    business: Record<string, number>;
    realEstate: Record<string, number>;
  };
  /** 源泉徴収税額 */
  withholdingTax: number;
  /** 予定納税額（第1期・第2期の合計） */
  prepaidTax: number;
  /** 修正申告: 修正前の第3期分の税額（申告済みの「納める税金」）。修正でなければ null */
  originalThirdPeriodTax: number | null;
  /**
   * 申告の種類。white のときは青色申告決算書（KOA210/KOA220）の代わりに
   * 収支内訳書（KOA110/KOA130）を添付する。省略時は青色として扱う
   * （figures の青色申告特別控除もこの区分で計算されている前提）。
   */
  filingType?: FilingType;
  /**
   * 減価償却費の計算の明細行（固定資産台帳から作る）。
   * 事業分は KOA210/KOA110、不動産分は KOA220/KOA130 の明細欄に出力する。
   */
  depreciation?: {
    business: DepreciationDetailRow[];
    realEstate: DepreciationDetailRow[];
    /** 農業分は KOA240（3面）/ KOA120（2面）の明細欄に出力する */
    agriculture?: DepreciationDetailRow[];
  };
  /** 貸借対照表（KOA210 4面）の入力。事業所得分のみ。貸借一致しない場合は例外。 */
  balanceSheet?: XtxBalanceSheetInput;
}

/** 貸借対照表の勘定キー */
export type BalanceSheetAccount =
  | "cash" | "checking_deposit" | "time_deposit" | "other_deposit"
  | "notes_receivable" | "accounts_receivable" | "securities" | "inventory"
  | "prepaid_expenses" | "loans_receivable" | "buildings" | "building_equipment"
  | "machinery" | "vehicles" | "tools_equipment" | "land"
  | "notes_payable" | "accounts_payable" | "borrowings" | "other_payables"
  | "advances_received" | "deposits_received" | "allowance_for_doubtful_accounts"
  | "capital";

export interface XtxBalanceSheetInput {
  /** 期首の金額（勘定キー→金額）。元入金は capital に入れる */
  opening: Partial<Record<BalanceSheetAccount, number>>;
  /** 期末の金額（資産・負債のみ。元入金は期首・事業主貸借・所得から計算する） */
  closing: Partial<Record<BalanceSheetAccount, number>>;
  extraAsset?: { name: string; opening: number; closing: number };
  extraLiability1?: { name: string; opening: number; closing: number };
  extraLiability2?: { name: string; opening: number; closing: number };
  /** 事業主貸（期末・資産の部） */
  ownerLoan: number;
  /** 事業主借（期末・負債資本の部の内訳行。期末の負債・資本合計に加える） */
  ownerBorrowing: number;
}

interface YearVersions {
  procedure: string;
  koa020: string;
  koa210: string;
  koa220: string;
  koa110: string;
  koa130: string;
  koa240: string;
  koa120: string;
  koc080: string;
}

/**
 * 年分 → 手続・様式バージョン（手続内帳票対応表の組）。対応外の年は生成できない。
 * 2026年分は e-Tax 公式「令和9年1月受付開始予定の帳票一覧」で確認:
 * KOA020=24.0、KOA210=12.0、KOA220=9.0。手続VRは 25.0.1 からの
 * 連番パターンで 26.0.1（XSD は RKO0010-260.xsd）。
 */
const YEAR_VERSIONS: Record<number, YearVersions> = {
  // KOC080（株式等に係る譲渡所得等の金額の計算明細書）の様式バージョンは
  // 手続XSD（RKO0010）の include で確認: 2023=17.0 / 2024=18.0 / 2025=19.0。
  // 2026年分の 20.0 は連番からの推定（2026年分の手続XSDは未同梱で検証不能）。
  // 農業様式（KOA240 青色・農業所得用 / KOA120 収支内訳書・農業所得用）の
  // バージョンは、同梱XSD（KOA240=8.0 / KOA120=9.0、2025年分の受付セット）と
  // e-Tax 公式「令和9年1月受付開始予定の帳票一覧」（2026年分: KOA240=9.0 /
  // KOA120=10.0）で確認。2023・2024年分は同梱XSDの版が継続する前提。
  2023: { procedure: "23.1.1", koa020: "21.0", koa210: "11.0", koa220: "8.0", koa110: "12.0", koa130: "9.0", koa240: "8.0", koa120: "9.0", koc080: "17.0" },
  2024: { procedure: "24.0.1", koa020: "22.0", koa210: "11.0", koa220: "8.0", koa110: "12.0", koa130: "9.0", koa240: "8.0", koa120: "9.0", koc080: "18.0" },
  2025: { procedure: "25.0.1", koa020: "23.0", koa210: "11.0", koa220: "8.0", koa110: "12.0", koa130: "9.0", koa240: "8.0", koa120: "9.0", koc080: "19.0" },
  2026: { procedure: "26.0.1", koa020: "24.0", koa210: "12.0", koa220: "9.0", koa110: "13.0", koa130: "10.0", koa240: "9.0", koa120: "10.0", koc080: "20.0" },
};

const SOFT_NAME = "eTaxAgent";

/** XTX生成に対応している年分の一覧。 */
export function xtxSupportedYears(): number[] {
  return Object.keys(YEAR_VERSIONS)
    .map((y) => Number(y))
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------------

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 金額要素。0以下なら出力しない（任意項目のため）。負の所得はそのまま出す。 */
export function amount(tag: string, value: number): string {
  if (!value) return "";
  return `<${tag}>${Math.trunc(value)}</${tag}>`;
}

/** 金額要素（0でも必ず出す。合計欄など）。 */
export function amountAlways(tag: string, value: number): string {
  return `<${tag}>${Math.trunc(value)}</${tag}>`;
}

/** IT部参照（空要素 + IDREF）。 */
export function ref(tag: string, idref: string): string {
  return `<${tag} IDREF="${idref}"/>`;
}

/** 区分（kubun複合型: kubun_CD 子要素）。 */
export function kubun(tag: string, code: number): string {
  return `<${tag}><kubun_CD>${code}</kubun_CD></${tag}>`;
}

/** 区分を要素の内容として直接書く形式（ABB00435 等、単純型の区分フィールド用）。 */
export function kubunValue(tag: string, code: number): string {
  return `<${tag}>${code}</${tag}>`;
}

interface EraDate {
  era: number;
  yy: number;
  mm: number;
  dd: number;
}

/** 西暦日付 "YYYY-MM-DD" を元号付きに分解する。 */
export function toEraDate(iso: string): EraDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  // 元号の開始日（改元の月日境界まで含めて判定する）
  if (iso >= "2019-05-01") return { era: 5, yy: year - 2018, mm, dd }; // 令和
  if (iso >= "1989-01-08") return { era: 4, yy: year - 1988, mm, dd }; // 平成
  if (iso >= "1926-12-25") return { era: 3, yy: year - 1925, mm, dd }; // 昭和
  if (iso >= "1912-07-30") return { era: 2, yy: year - 1911, mm, dd }; // 大正
  if (iso >= "1868-10-23") return { era: 1, yy: year - 1867, mm, dd }; // 明治
  return null;
}

/** 年分（yy複合型: era + yy）の IT部要素とその中身。子要素は general 名前空間。 */
export function eraYearXml(year: number): string {
  // 2019年分以降は令和。令和元年 = 2019年。
  return `<gen:era>5</gen:era><gen:yy>${year - 2018}</gen:yy>`;
}

export function yymmddXml(iso: string): string {
  const d = toEraDate(iso);
  if (!d) return "";
  return `<gen:era>${d.era}</gen:era><gen:yy>${d.yy}</gen:yy><gen:mm>${d.mm}</gen:mm><gen:dd>${d.dd}</gen:dd>`;
}

/** 電話番号を tel1/tel2/tel3 に分ける。ハイフン区切り優先。 */
export function phoneXml(phone: string): string {
  const parts = phone.split("-").filter((p) => p !== "");
  let tel: string[] = [];
  if (parts.length === 3) {
    tel = parts;
  } else {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11) tel = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
    else if (digits.length === 10) tel = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6)];
    else if (digits) tel = [digits];
  }
  if (tel.length === 0) return "";
  return (
    (tel[0] ? `<gen:tel1>${esc(tel[0])}</gen:tel1>` : "") +
    (tel[1] ? `<gen:tel2>${esc(tel[1])}</gen:tel2>` : "") +
    (tel[2] ? `<gen:tel3>${esc(tel[2])}</gen:tel3>` : "")
  );
}

/** 郵便番号を zip1/zip2 に分ける。 */
export function zipXml(zipCode: string): string {
  const digits = zipCode.replace(/\D/g, "");
  if (digits.length !== 7) return "";
  return `<gen:zip1>${digits.slice(0, 3)}</gen:zip1><gen:zip2>${digits.slice(3)}</gen:zip2>`;
}

// ---------------------------------------------------------------------------
// IT部
// ---------------------------------------------------------------------------

/** 税務署要素（ZEIMUSHO）。子要素名は XSD 定義どおり先頭小文字の zeimusho_CD / zeimusho_NM。 */
export function zeimushoXml(t: XtxTaxpayer): string {
  const cd = t.taxOfficeCode
    ? `<gen:zeimusho_CD>${esc(t.taxOfficeCode)}</gen:zeimusho_CD>`
    : "";
  return `<ZEIMUSHO ID="ZEIMUSHO">${cd}<gen:zeimusho_NM>${esc(t.taxOfficeName)}</gen:zeimusho_NM></ZEIMUSHO>`;
}

/** 利用者識別番号要素（NOZEISHA_ID、IT部の必須要素）。数字のみを取り出す。 */
export function nozeishaIdXml(t: XtxTaxpayer): string {
  const digits = t.userId.replace(/\D/g, "");
  if (!digits) return "";
  return `<NOZEISHA_ID ID="NOZEISHA_ID">${esc(digits)}</NOZEISHA_ID>`;
}

function buildIt(data: XtxFilingData): string {
  const t = data.taxpayer;
  // ITdefinition.xsd の ITtype シーケンス順に並べる（順序が違うと検証エラー）。
  const items: string[] = [];
  if (t.taxOfficeName) items.push(zeimushoXml(t));
  const sub = yymmddXml(data.submissionDate);
  if (sub) items.push(`<TEISYUTSU_DAY ID="TEISYUTSU_DAY">${sub}</TEISYUTSU_DAY>`);
  const uid = nozeishaIdXml(t);
  if (uid) items.push(uid);
  if (t.myNumber) {
    items.push(
      `<NOZEISHA_BANGO ID="NOZEISHA_BANGO"><gen:kojinbango>${esc(t.myNumber)}</gen:kojinbango></NOZEISHA_BANGO>`,
    );
  }
  if (t.nameKana) items.push(`<NOZEISHA_NM_KN ID="NOZEISHA_NM_KN">${esc(t.nameKana)}</NOZEISHA_NM_KN>`);
  if (t.name) items.push(`<NOZEISHA_NM ID="NOZEISHA_NM">${esc(t.name)}</NOZEISHA_NM>`);
  const zip = zipXml(t.zipCode);
  if (zip) items.push(`<NOZEISHA_ZIP ID="NOZEISHA_ZIP">${zip}</NOZEISHA_ZIP>`);
  if (t.address) items.push(`<NOZEISHA_ADR ID="NOZEISHA_ADR">${esc(t.address)}</NOZEISHA_ADR>`);
  if (t.jan1Address) {
    items.push(`<ICHIGATSUIPPI_ADR ID="ICHIGATSUIPPI_ADR">${esc(t.jan1Address)}</ICHIGATSUIPPI_ADR>`);
  }
  if (t.shopName) items.push(`<NOZEISHA_YAGO ID="NOZEISHA_YAGO">${esc(t.shopName)}</NOZEISHA_YAGO>`);
  const tel = phoneXml(t.phone);
  if (tel) items.push(`<NOZEISHA_TEL ID="NOZEISHA_TEL">${tel}</NOZEISHA_TEL>`);
  const birth = yymmddXml(t.birthDate);
  if (birth) items.push(`<BIRTHDAY ID="BIRTHDAY">${birth}</BIRTHDAY>`);
  if (t.occupation) items.push(`<SHOKUGYO ID="SHOKUGYO">${esc(t.occupation)}</SHOKUGYO>`);
  items.push(`<TETSUZUKI ID="TETSUZUKI"><procedure_CD>RKO0010</procedure_CD></TETSUZUKI>`);
  items.push(`<NENBUN ID="NENBUN">${eraYearXml(data.year)}</NENBUN>`);
  items.push(
    `<SHINKOKU_KBN ID="SHINKOKU_KBN"><kubun_CD>${data.amendment ? 2 : 1}</kubun_CD></SHINKOKU_KBN>`,
  );
  return `<IT VR="1.0" id="IT">${items.join("")}</IT>`;
}

// ---------------------------------------------------------------------------
// KOA020 第一表
// ---------------------------------------------------------------------------

/** 拡張所得の決定的な内訳。入力が未指定・全て空なら undefined（従来どおりの申告書）。 */
function expandedOf(data: XtxFilingData): ExpandedIncomeBreakdown | undefined {
  if (!data.expandedIncome || isExpandedIncomeEmpty(data.expandedIncome)) return undefined;
  return computeExpandedIncomes(data.expandedIncome);
}

function buildKoa020Face1(data: XtxFilingData): string {
  const t = data.taxpayer;
  const f = data.figures;
  const d = data.tax.deductions;
  const c = data.tax.taxCredits;

  // --- 見出し部 ---
  const header: string[] = [];
  header.push(ref("ABA00010", "NENBUN"));
  header.push(ref("ABA00020", "SHINKOKU_KBN"));
  if (t.taxOfficeName) header.push(ref("ABA00030", "ZEIMUSHO"));
  if (toEraDate(data.submissionDate)) header.push(ref("ABA00040", "TEISYUTSU_DAY"));

  const taxpayer: string[] = [];
  const currentAddress: string[] = [];
  if (zipXml(t.zipCode)) currentAddress.push(ref("ABA00080", "NOZEISHA_ZIP"));
  if (t.address) currentAddress.push(ref("ABA00090", "NOZEISHA_ADR"));
  if (t.addressLine2) currentAddress.push(`<ABA00095>${esc(t.addressLine2)}</ABA00095>`);
  if (currentAddress.length > 0) {
    taxpayer.push(`<ABA00060>${currentAddress.join("")}</ABA00060>`);
  }
  if (t.jan1Address) {
    // 1月1日は対象年の翌年1月1日
    taxpayer.push(
      `<ABA00100><ABA00110>${eraYearXml(data.year + 1)}</ABA00110>${ref("ABA00120", "ICHIGATSUIPPI_ADR")}</ABA00100>`,
    );
  }
  if (t.myNumber) taxpayer.push(ref("ABA00125", "NOZEISHA_BANGO"));
  if (t.nameKana) taxpayer.push(ref("ABA00130", "NOZEISHA_NM_KN"));
  if (t.name) taxpayer.push(ref("ABA00140", "NOZEISHA_NM"));
  if (t.occupation) taxpayer.push(ref("ABA00160", "SHOKUGYO"));
  if (t.shopName) taxpayer.push(ref("ABA00170", "NOZEISHA_YAGO"));
  if (toEraDate(t.birthDate)) taxpayer.push(ref("ABA00200", "BIRTHDAY"));
  if (phoneXml(t.phone)) taxpayer.push(ref("ABA00220", "NOZEISHA_TEL"));
  // 申告区分: 青色申告 = 1、白色申告 = 2
  const expanded = expandedOf(data);
  const kinds: string[] = [kubun("ABA00240", data.filingType === "white" ? 2 : 1)];
  // 分離区分: 第三表（申告分離課税）を使う場合は 1
  if (expanded?.hasSeparateTaxation) kinds.push(kubun("ABA00250", 1));
  if (data.amendment) kinds.push(kubun("ABA00256", 1)); // 修正区分: 該当
  taxpayer.push(`<ABA00230>${kinds.join("")}</ABA00230>`);
  header.push(`<ABA00050>${taxpayer.join("")}</ABA00050>`);

  // --- 申告内容 ---
  const body: string[] = [];

  // 給与・雑所得の最終金額（調整控除・公的年金等控除を含む決定的計算）
  const manual = computeManualIncomes(
    data.year,
    data.salaryIncome ?? { revenue: 0 },
    data.miscIncome,
    f._detail.business_income + f._detail.real_estate_income,
  );

  // 収入金額等
  const revenues: string[] = [];
  if (f.business_revenue || f.agriculture_revenue) {
    const businessRevenueParts: string[] = [];
    if (f.business_revenue) {
      businessRevenueParts.push(amount("ABB00030", f.business_revenue));
    }
    // 農業の収入金額は決算書（農業所得用）の「収入金額の計」を出す
    if (f.agriculture_revenue) {
      businessRevenueParts.push(amount("ABB00040", f.agriculture_revenue));
    }
    revenues.push(`<ABB00020>${businessRevenueParts.join("")}</ABB00020>`);
  }
  revenues.push(amount("ABB00050", f.real_estate_revenue));
  // 配当（総合課税分のみ。申告分離分は第三表、申告不要分は記載しない）
  if (expanded) revenues.push(amount("ABB00070", expanded.dividend.comprehensiveRevenue));
  if (data.salaryIncome && data.salaryIncome.revenue > 0) {
    revenues.push(amountAlways("ABB00080", data.salaryIncome.revenue));
  }
  if (
    data.miscIncome.pensionRevenue > 0 ||
    data.miscIncome.businessRevenue > 0 ||
    data.miscIncome.revenue > 0
  ) {
    const misc: string[] = [];
    if (data.miscIncome.pensionRevenue > 0) {
      misc.push(amountAlways("ABB00100", data.miscIncome.pensionRevenue));
    }
    if (data.miscIncome.businessRevenue > 0) {
      if (data.miscIncome.businessKubun > 0) misc.push(`<ABB00103>${data.miscIncome.businessKubun}</ABB00103>`);
      misc.push(amountAlways("ABB00105", data.miscIncome.businessRevenue));
    }
    if (data.miscIncome.revenue > 0) {
      if (data.miscIncome.kubun > 0) misc.push(`<ABB00107>${data.miscIncome.kubun}</ABB00107>`);
      misc.push(amountAlways("ABB00110", data.miscIncome.revenue));
    }
    revenues.push(`<ABB00090>${misc.join("")}</ABB00090>`);
  }
  // 一時（収入金額。所得金額は1/2算入後の額を ABB00400 に出す）
  if (expanded) revenues.push(amount("ABB00230", expanded.temp.revenue));
  if (revenues.length > 0) body.push(`<ABB00010>${revenues.join("")}</ABB00010>`);

  // 所得金額等
  const incomes: string[] = [];
  if (f.business_revenue || f.business_expenses || f.agriculture_revenue || f.agriculture_expenses) {
    const businessIncomeParts: string[] = [];
    if (f.business_revenue || f.business_expenses) {
      businessIncomeParts.push(amountAlways("ABB00300", f._detail.business_income));
    }
    if (f.agriculture_revenue || f.agriculture_expenses) {
      businessIncomeParts.push(amountAlways("ABB00320", f._detail.agriculture_income));
    }
    incomes.push(`<ABB00280>${businessIncomeParts.join("")}</ABB00280>`);
  }
  incomes.push(amount("ABB00340", f._detail.real_estate_income));
  // 配当（総合課税分の所得金額）
  if (expanded) incomes.push(amount("ABB00360", expanded.dividend.comprehensiveIncome));
  if (data.salaryIncome && data.salaryIncome.revenue > 0) {
    incomes.push(amountAlways("ABB00370", manual.salary));
  }
  if (
    manual.miscTotal !== 0 ||
    data.miscIncome.pensionRevenue > 0 ||
    data.miscIncome.businessRevenue > 0 ||
    data.miscIncome.revenue > 0
  ) {
    // 雑: ⑦公的年金等 + ⑧業務 + ⑨その他 + ⑩（⑦〜⑨の計）。赤字もそのまま出す
    const miscParts: string[] = [];
    if (manual.pension > 0) miscParts.push(amountAlways("ABB01060", manual.pension));
    if (manual.miscBusiness !== 0) {
      miscParts.push(`<ABB01070>${amountAlways("ABB01090", manual.miscBusiness)}</ABB01070>`);
    }
    if (manual.miscOther !== 0) {
      miscParts.push(`<ABB01100>${amountAlways("ABB01120", manual.miscOther)}</ABB01100>`);
    }
    miscParts.push(amountAlways("ABB01130", manual.miscTotal));
    incomes.push(`<ABB01050>${miscParts.join("")}</ABB01050>`);
  }
  // 総合譲渡・一時（⑫）: 一時所得の1/2算入後の額（総合譲渡は対象外）
  if (expanded) incomes.push(amount("ABB00400", expanded.temp.includedAmount));
  incomes.push(amountAlways("ABB00410", data.tax.totalIncome));
  body.push(`<ABB00270>${incomes.join("")}</ABB00270>`);

  // 所得から差し引かれる金額
  const ded: string[] = [];
  ded.push(amount("ABB00430", d.casualtyLoss));
  // 医療費控除の区分1はセルフメディケーション税制を選んだ印。通常の医療費控除では書かない
  if (d.medical > 0) ded.push(amountAlways("ABB00440", d.medical));
  ded.push(amount("ABB00450", d.socialInsurance));
  ded.push(amount("ABB00460", d.smallBusinessMutualAid));
  ded.push(amount("ABB00470", d.lifeInsurance));
  ded.push(amount("ABB00480", d.earthquakeInsurance));
  ded.push(amount("ABB00490", d.donations));
  const widowSingle = d.widow + d.singleParent;
  // 寡婦・ひとり親控除の区分1はひとり親控除の印。寡婦控除では書かない
  if (widowSingle > 0) {
    ded.push((d.singleParent > 0 ? kubunValue("ABB00495", 1) : "") + amountAlways("ABB00500", widowSingle));
  }
  ded.push(amount("ABB00510", d.workingStudent + d.disability));
  const spouseTotal = d.spouse + d.spouseSpecial;
  if (spouseTotal > 0) {
    // 区分1は配偶者特別控除がある場合に立てる
    ded.push((d.spouseSpecial > 0 ? kubunValue("ABB00515", 1) : "") + amountAlways("ABB00520", spouseTotal));
  }
  ded.push(amount("ABB00540", d.dependents));
  if (d.specialRelative > 0) {
    // 特定親族特別控除（KOA020-023 以降の様式。人数は入力が単一のため 1）
    ded.push(
      `<ABB00542>${amountAlways("ABB00546", 1)}${amountAlways("ABB00548", d.specialRelative)}</ABB00542>`,
    );
  }
  ded.push(amountAlways("ABB00550", d.basic));
  ded.push(amountAlways("ABB00555", d.total));
  body.push(`<ABB00420>${ded.join("")}</ABB00420>`);

  // 税金の計算
  const taxCalc: string[] = [];
  const tax = data.tax;
  // 差引所得税額は定額減税と外国税額控除を引く前の額（0が下限）。令和6年分は
  // 再差引所得税額・令和6年分特別税額控除（3万円 × 人数をそのまま書く）を経て、
  // 再々差引所得税額（基準所得税額）に至る。基準所得税額は外国税額控除を
  // 適用しない額で、外国税額控除等は所得税及び復興特別所得税の額から
  // ABB01040 として一度だけ引く。
  const creditsBeforeFlatReduction = c.total - c.foreignTax - c.flatReduction;
  const differential = Math.max(tax.incomeTaxBase - creditsBeforeFlatReduction, 0);
  const standardIncomeTax = tax.taxAfterOtherCredits;
  const taxTotal = standardIncomeTax + tax.reconstructionTaxGross;
  // 課税される所得金額: 第三表がある場合は総合＋分離課税分の合計
  const taxableTotal =
    tax.taxableIncome +
    (expanded?.hasSeparateTaxation
      ? tax.taxableSeparateStocks + tax.taxableSeparateDividends
      : 0);
  taxCalc.push(amountAlways("ABB00580", taxableTotal));
  taxCalc.push(amountAlways("ABB00590", tax.incomeTaxBase));
  taxCalc.push(amount("ABB00600", c.dividend));
  taxCalc.push(amount("ABB00650", c.housingLoan));
  taxCalc.push(amount("ABB00660", c.politicalDonations + c.certifiedNpoDonations));
  taxCalc.push(amount("ABB00663", c.seismicRetrofit));
  taxCalc.push(amountAlways("ABB00670", differential));
  if (data.year === 2024) {
    taxCalc.push(amountAlways("ABB00682", differential));
    if (c.flatReduction > 0) {
      taxCalc.push(
        `<ABB00684>${amountAlways("ABB00686", Math.trunc(c.flatReduction / 30_000))}${amountAlways("ABB00688", c.flatReduction)}</ABB00684>`,
      );
    }
  }
  taxCalc.push(amountAlways("ABB01010", standardIncomeTax));
  taxCalc.push(amountAlways("ABB01020", tax.reconstructionTaxGross));
  taxCalc.push(amountAlways("ABB01030", taxTotal));
  taxCalc.push(amount("ABB01040", c.foreignTax));
  taxCalc.push(amount("ABB00710", data.withholdingTax));
  // 申告納税額は100円未満切捨て（国税通則法119条）。還付になる場合は切り捨てず負のまま出す。
  const declaredRaw = taxTotal - c.foreignTax - data.withholdingTax;
  const declaredTax = declaredRaw > 0 ? Math.floor(declaredRaw / 100) * 100 : declaredRaw;
  taxCalc.push(amountAlways("ABB00720", declaredTax));
  taxCalc.push(amount("ABB00730", data.prepaidTax));
  // 第3期分: 納付は申告納税額−予定納税額、還付は過払い全額
  const thirdPeriod = declaredTax - data.prepaidTax;
  if (thirdPeriod > 0) taxCalc.push(`<ABB00740>${amountAlways("ABB00750", thirdPeriod)}</ABB00740>`);
  else if (thirdPeriod < 0) taxCalc.push(`<ABB00740>${amountAlways("ABB00760", -thirdPeriod)}</ABB00740>`);
  body.push(`<ABB00570>${taxCalc.join("")}</ABB00570>`);

  // 修正申告・その他は「税金の計算」グループの外（申告内容の直下）に置く
  if (data.amendment && data.originalThirdPeriodTax !== null) {
    const increase = Math.floor(Math.max(thirdPeriod - data.originalThirdPeriodTax, 0) / 100) * 100;
    body.push(
      `<ABB00763>${amountAlways("ABB00765", data.originalThirdPeriodTax)}${amountAlways("ABB00767", increase)}</ABB00763>`,
    );
  }
  // その他: 青色申告特別控除額
  if (f.blue_deduction > 0) {
    body.push(`<ABB00770>${amountAlways("ABB00800", f.blue_deduction)}</ABB00770>`);
  }

  return `<KOA020-1 page="1"><ABA00000>${header.join("")}</ABA00000><ABB00000>${body.join("")}</ABB00000></KOA020-1>`;
}

// ---------------------------------------------------------------------------
// KOA020 第二表
// ---------------------------------------------------------------------------

function buildKoa020Face2(data: XtxFilingData): string {
  const t = data.taxpayer;
  const header: string[] = [];
  header.push(ref("ABC00010", "NENBUN"));
  header.push(ref("ABC00015", "SHINKOKU_KBN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(ref("ABC00040", "NOZEISHA_ADR"));
  if (t.nameKana) taxpayer.push(ref("ABC00060", "NOZEISHA_NM_KN"));
  if (t.name) taxpayer.push(ref("ABC00070", "NOZEISHA_NM"));
  if (taxpayer.length > 0) header.push(`<ABC00020>${taxpayer.join("")}</ABC00020>`);

  const detail: string[] = [];
  const lp = data.deductionInputs.lifeInsurance;
  const lifeRows: string[] = [];
  const lifeFields: [string, number][] = [
    ["ABH00215", lp.newGeneral],
    ["ABH00220", lp.oldGeneral],
    ["ABH00225", lp.newPension],
    ["ABH00230", lp.oldPension],
    ["ABH00235", lp.newCareMedical],
  ];
  for (const [tag, value] of lifeFields) {
    if (value > 0) lifeRows.push(`<${tag}>${value}</${tag}>`);
  }
  if (lifeRows.length > 0) detail.push(`<ABH00210>${lifeRows.join("")}</ABH00210>`);

  const eq = data.deductionInputs.earthquakeInsurance;
  const eqRows: string[] = [];
  if (eq.earthquake > 0) eqRows.push(`<ABH00250>${eq.earthquake}</ABH00250>`);
  if (eq.oldLongTerm > 0) eqRows.push(`<ABH00260>${eq.oldLongTerm}</ABH00260>`);
  if (eqRows.length > 0) detail.push(`<ABH00240>${eqRows.join("")}</ABH00240>`);

  const parts: string[] = [`<ABC00000>${header.join("")}</ABC00000>`];
  if (detail.length > 0) parts.push(`<ABH00000>${detail.join("")}</ABH00000>`);
  return `<KOA020-2 page="1">${parts.join("")}</KOA020-2>`;
}

// ---------------------------------------------------------------------------
// KOA020 第三表（分離課税用）— Issue #27 Phase C
// ---------------------------------------------------------------------------

/**
 * 第三表（KOA020-3）。申告分離課税の所得（株式等譲渡・上場配当）がある
 * 場合のみ出力する。タグ対応は同梱の公式XSD（KOA020）で確認:
 * 収入金額 ト=ABL00125（一般株式等）/ チ=ABL00130（上場株式等）/
 * リ収入金額=ABL00137、所得金額 ト=ABL00305 / チ=ABL00310 /
 * リ所得金額=ABL00325、税金の計算 ヲ=ABL00500（株式等）/
 * ワ=ABL00505（配当）/ 税額 ル=ABL00600 / ヲ（配当）=ABL00610。
 * 金額要素（gen:kingaku）は符号なしのため、赤字の区分の所得金額は
 * 要素ごと省略する（損益通算・課税所得は正の区分と合計で表す）。
 */
function buildKoa020Face3(data: XtxFilingData): string {
  const expanded = expandedOf(data);
  if (!expanded || !expanded.hasSeparateTaxation) return "";
  const t = data.taxpayer;
  const tax = data.tax;

  const header: string[] = [];
  header.push(ref("ABK00010", "NENBUN"));
  header.push(ref("ABK00020", "SHINKOKU_KBN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(`<ABK00040>${ref("ABK00060", "NOZEISHA_ADR")}</ABK00040>`);
  if (t.shopName) taxpayer.push(ref("ABK00066", "NOZEISHA_YAGO"));
  if (t.nameKana) taxpayer.push(ref("ABK00070", "NOZEISHA_NM_KN"));
  if (t.name) taxpayer.push(ref("ABK00080", "NOZEISHA_NM"));
  if (taxpayer.length > 0) header.push(`<ABK00030>${taxpayer.join("")}</ABK00030>`);

  const body: string[] = [];
  // 収入金額
  const revenues: string[] = [];
  const stockRevenues: string[] = [];
  stockRevenues.push(amount("ABL00125", expanded.stocks.general.revenue + expanded.stocks.general.otherRevenue));
  stockRevenues.push(amount("ABL00130", expanded.stocks.listed.revenueTotal));
  if (stockRevenues.some((s) => s !== "")) {
    revenues.push(`<ABL00100>${stockRevenues.join("")}</ABL00100>`);
  }
  if (expanded.dividend.listedMode === "separate" && expanded.dividend.separateRevenue > 0) {
    revenues.push(`<ABL00134>${amountAlways("ABL00137", expanded.dividend.separateRevenue)}</ABL00134>`);
  }
  if (revenues.length > 0) body.push(`<ABL00010><ABL00020>${revenues.join("")}</ABL00020></ABL00010>`);

  // 所得金額（リは上場譲渡損失との損益通算後の額）
  const incomes: string[] = [];
  const stockIncomes: string[] = [];
  stockIncomes.push(amount("ABL00305", Math.max(expanded.stocks.general.income, 0)));
  stockIncomes.push(amount("ABL00310", Math.max(expanded.stocks.listed.income, 0)));
  if (stockIncomes.some((s) => s !== "")) {
    incomes.push(`<ABL00280>${stockIncomes.join("")}</ABL00280>`);
  }
  if (expanded.dividend.listedMode === "separate" && expanded.separateDividendIncome > 0) {
    incomes.push(`<ABL00320>${amountAlways("ABL00325", expanded.separateDividendIncome)}</ABL00320>`);
  }
  if (incomes.length > 0) body.push(`<ABL00190><ABL00200>${incomes.join("")}</ABL00200></ABL00190>`);

  // 税金の計算
  const calc: string[] = [];
  calc.push(amountAlways("ABL00440", tax.totalIncome));
  calc.push(amountAlways("ABL00450", tax.deductionsTotal));
  const taxable: string[] = [];
  taxable.push(amountAlways("ABL00470", tax.taxableIncome));
  taxable.push(amountAlways("ABL00500", tax.taxableSeparateStocks));
  taxable.push(amountAlways("ABL00505", tax.taxableSeparateDividends));
  calc.push(`<ABL00460>${taxable.join("")}</ABL00460>`);
  const taxes: string[] = [];
  taxes.push(amountAlways("ABL00550", tax.incomeTaxComprehensive));
  taxes.push(amountAlways("ABL00600", tax.incomeTaxSeparateStocks));
  taxes.push(amountAlways("ABL00610", tax.incomeTaxSeparateDividends));
  calc.push(`<ABL00540>${taxes.join("")}</ABL00540>`);
  calc.push(amountAlways("ABL00620", tax.incomeTaxBase));
  body.push(`<ABL00430>${calc.join("")}</ABL00430>`);

  // 上場株式等の譲渡所得等の源泉徴収税額の合計額
  if (expanded.stocks.withholding > 0) {
    body.push(amountAlways("ABL00867", expanded.stocks.withholding));
  }

  return `<KOA020-3 page="1"><ABK00000>${header.join("")}</ABK00000><ABL00000>${body.join("")}</ABL00000></KOA020-3>`;
}

// ---------------------------------------------------------------------------
// KOC080 株式等に係る譲渡所得等の金額の計算明細書 — Issue #27 Phase C
// ---------------------------------------------------------------------------

/**
 * 計算明細書（KOC080）。株式等譲渡の入力がある場合のみ生成する。
 * 1面は一般株式等・上場株式等の収入・費用・差引・所得金額、
 * 2面は源泉徴収口座（特定口座）の明細（様式の上限5行まで）。
 * タグ対応は同梱の公式XSD（KOC080）で確認。金額要素は符号なしのため、
 * 差引金額・所得金額が赤字の場合は要素ごと省略する。
 */
function buildKoc080(data: XtxFilingData, vr: string): string {
  const expanded = expandedOf(data);
  if (!expanded || !expanded.hasStockTransfer) return "";
  const t = data.taxpayer;
  const stocks = expanded.stocks;

  const header: string[] = [];
  header.push(ref("EHN00000", "NENBUN"));
  if (t.taxOfficeName) header.push(ref("EHP00000", "ZEIMUSHO"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(ref("EHB00010", "NOZEISHA_ADR"));
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("EHB00040", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("EHB00050", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<EHB00030>${nameParts.join("")}</EHB00030>`);
  if (taxpayer.length > 0) header.push(`<EHB00000>${taxpayer.join("")}</EHB00000>`);

  interface CategoryTags {
    wrap: string;
    revenueInner: string;
    revenue: string;
    otherRevenue: string;
    subtotalRevenue: string;
    costWrap: string;
    cost: string;
    fees: string;
    otherExpenses: string;
    subtotalCost: string;
    diff: string;
    income: string;
  }
  const categoryXml = (
    tags: CategoryTags,
    cat: { revenue: number; otherRevenue: number; acquisitionCost: number; transferFees: number; otherExpenses: number; income: number },
  ): string => {
    const revenueTotal = cat.revenue + cat.otherRevenue;
    const costTotal = cat.acquisitionCost + cat.transferFees + cat.otherExpenses;
    if (revenueTotal === 0 && costTotal === 0) return "";
    const diff = revenueTotal - costTotal;
    const parts: string[] = [];
    parts.push(
      `<${tags.revenueInner}>` +
        amountAlways(tags.revenue, cat.revenue) +
        amount(tags.otherRevenue, cat.otherRevenue) +
        amountAlways(tags.subtotalRevenue, revenueTotal) +
        `</${tags.revenueInner}>`,
    );
    parts.push(
      `<${tags.costWrap}>` +
        amountAlways(tags.cost, cat.acquisitionCost) +
        amount(tags.fees, cat.transferFees) +
        amount(tags.otherExpenses, cat.otherExpenses) +
        amountAlways(tags.subtotalCost, costTotal) +
        `</${tags.costWrap}>`,
    );
    if (diff > 0) parts.push(amountAlways(tags.diff, diff));
    if (cat.income > 0) parts.push(amountAlways(tags.income, cat.income));
    return `<${tags.wrap}>${parts.join("")}</${tags.wrap}>`;
  };

  const general = categoryXml(
    {
      wrap: "EHD00030", revenueInner: "EHD00040",
      revenue: "EHD00050", otherRevenue: "EHD00060", subtotalRevenue: "EHD00070",
      costWrap: "EHD00080", cost: "EHD00090", fees: "EHD00100", otherExpenses: "EHD00110",
      subtotalCost: "EHD00130", diff: "EHD00140", income: "EHD00160",
    },
    stocks.general,
  );
  const listed = categoryXml(
    {
      wrap: "EHD00190", revenueInner: "EHD00200",
      revenue: "EHD00210", otherRevenue: "EHD00220", subtotalRevenue: "EHD00230",
      costWrap: "EHD00240", cost: "EHD00250", fees: "EHD00260", otherExpenses: "EHD00270",
      subtotalCost: "EHD00290", diff: "EHD00300", income: "EHD00320",
    },
    // 1面の上場株式等欄は特定口座分を含む総額を書き、2面がその内訳になる
    // （内訳の合算は shared の computeStockTransfer が済ませている）
    {
      revenue: stocks.listed.revenue,
      otherRevenue: stocks.listed.otherRevenue,
      acquisitionCost: stocks.listed.acquisitionCost,
      transferFees: stocks.listed.transferFees,
      otherExpenses: stocks.listed.otherExpenses,
      income: stocks.listed.income,
    },
  );
  const page1 =
    `<KOC080-1 page="1">${header.join("")}` +
    `<EHD00000>${general}${listed}</EHD00000></KOC080-1>`;

  // 2面: 源泉徴収口座（特定口座）の明細。様式の繰り返し上限は5行
  let page2 = "";
  const accounts = data.expandedIncome?.stocks.specialAccounts ?? [];
  if (accounts.length > 0) {
    const rows = accounts.slice(0, 5).map((a) => {
      const parts: string[] = [];
      const broker: string[] = [];
      if (a.brokerName) broker.push(`<EHQ00040>${esc(a.brokerName)}</EHQ00040>`);
      if (a.branchName) broker.push(`<EHQ00070>${esc(a.branchName)}</EHQ00070>`);
      if (broker.length > 0) parts.push(`<EHQ00030>${broker.join("")}</EHQ00030>`);
      parts.push(amountAlways("EHQ00100", a.revenue));
      parts.push(amountAlways("EHQ00110", a.cost));
      if (a.revenue - a.cost > 0) parts.push(amountAlways("EHQ00120", a.revenue - a.cost));
      parts.push(amount("EHQ00130", a.withholding));
      return `<EHQ00010>${parts.join("")}</EHQ00010>`;
    });
    const totals = stocks.specialAccountsTotal;
    const totalsParts: string[] = [];
    totalsParts.push(amountAlways("EHQ00150", totals.revenue));
    totalsParts.push(amountAlways("EHQ00160", totals.cost));
    if (totals.revenue - totals.cost > 0) {
      totalsParts.push(amountAlways("EHQ00170", totals.revenue - totals.cost));
    }
    totalsParts.push(amount("EHQ00180", totals.withholding));
    page2 =
      `<KOC080-2 page="2"><EHQ00000>${rows.join("")}` +
      `<EHQ00140>${totalsParts.join("")}</EHQ00140></EHQ00000></KOC080-2>`;
  }

  return `<KOC080 VR="${vr}" id="KOC080" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku">${page1}${page2}</KOC080>`;
}

// ---------------------------------------------------------------------------
// KOA210 青色申告決算書（一般用）1ページ目
// ---------------------------------------------------------------------------

/** KOA210 の固定経費欄（勘定科目名 → タグ）。試算表も同じ並びを使うため export する。 */
export const KOA210_EXPENSE_LINES: [string, string][] = [
  ["租税公課", "AMF00190"],
  ["荷造運賃", "AMF00200"],
  ["水道光熱費", "AMF00210"],
  ["旅費交通費", "AMF00220"],
  ["通信費", "AMF00230"],
  ["広告宣伝費", "AMF00240"],
  ["交際費", "AMF00250"],
  ["損害保険料", "AMF00260"],
  ["修繕費", "AMF00270"],
  ["消耗品費", "AMF00280"],
  ["減価償却費", "AMF00290"],
  ["福利厚生費", "AMF00300"],
  ["給料賃金", "AMF00310"],
  ["外注費", "AMF00320"],
  ["利子割引料", "AMF00330"],
  ["地代家賃", "AMF00340"],
  ["貸倒金", "AMF00350"],
  ["雑費", "AMF00370"],
];

function buildKoa210(data: XtxFilingData, vr: string): string {
  const t = data.taxpayer;
  const f = data.figures;
  const totals = { ...data.categoryTotals.business };
  // 分類カテゴリの「外注工賃」は決算書の固定行「外注費」に合算する
  if (totals["外注工賃"]) {
    totals["外注費"] = (totals["外注費"] ?? 0) + (totals["外注工賃"] ?? 0);
    totals["外注工賃"] = 0;
  }
  const purchases = totals["仕入高"] ?? 0;

  const parts: string[] = [];
  parts.push(ref("AMA00000", "NENBUN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(`<AMB00010>${esc(t.address)}</AMB00010>`);
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("AMB00030", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("AMB00040", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<AMB00020>${nameParts.join("")}</AMB00020>`);
  if (t.occupation) taxpayer.push(ref("AMB00090", "SHOKUGYO"));
  if (t.shopName) taxpayer.push(ref("AMB00100", "NOZEISHA_YAGO"));
  if (taxpayer.length > 0) parts.push(`<AMB00000>${taxpayer.join("")}</AMB00000>`);
  if (toEraDate(data.submissionDate)) parts.push(ref("AME00000", "TEISYUTSU_DAY"));

  const pl: string[] = [];
  pl.push(`<AMF00020><AMF00030><gen:mm>1</gen:mm><gen:dd>1</gen:dd></AMF00030><AMF00040><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AMF00040></AMF00020>`);
  const amounts: string[] = [];
  amounts.push(amountAlways("AMF00100", f.business_revenue));
  if (purchases > 0) {
    amounts.push(
      `<AMF00110>${amountAlways("AMF00130", purchases)}${amountAlways("AMF00140", purchases)}${amountAlways("AMF00160", purchases)}</AMF00110>`,
    );
  }
  amounts.push(amountAlways("AMF00170", f.business_revenue - purchases));

  const expenseLines: string[] = [];
  const fixedAccounts = new Set(KOA210_EXPENSE_LINES.map(([account]) => account));
  for (const [account, tag] of KOA210_EXPENSE_LINES) {
    if (tag === "AMF00370") continue; // 雑費は追加科目の後に置く
    expenseLines.push(amount(tag, totals[account] ?? 0));
  }
  const extras = Object.entries(totals).filter(
    ([account, value]) =>
      value > 0 && !fixedAccounts.has(account) && account !== "仕入高" && account !== "売上高",
  );
  // 追加科目は様式の上限（AMF00355 の maxOccurs = 6）まで。超過分は雑費に合算する
  for (const [account, value] of extras.slice(0, 6)) {
    expenseLines.push(
      `<AMF00355><AMF00060>${esc(account)}</AMF00060>${amountAlways("AMF00360", value)}</AMF00355>`,
    );
  }
  const extrasOverflow = extras.slice(6).reduce((sum, [, value]) => sum + value, 0);
  expenseLines.push(amount("AMF00370", (totals["雑費"] ?? 0) + extrasOverflow));
  const expenseTotal = f.business_expenses - purchases;
  expenseLines.push(amountAlways("AMF00380", expenseTotal));
  amounts.push(`<AMF00180>${expenseLines.join("")}</AMF00180>`);

  const beforeBlue = f._detail.business_income_before_deduction;
  amounts.push(amountAlways("AMF00390", beforeBlue));
  amounts.push(amountAlways("AMF00500", beforeBlue));
  amounts.push(amount("AMF00510", f._detail.blue_deduction_business));
  amounts.push(amountAlways("AMF00530", f._detail.business_income));
  pl.push(`<AMF00090>${amounts.join("")}</AMF00090>`);
  parts.push(`<AMF00000><AMF00010>${pl.join("")}</AMF00010></AMF00000>`);

  const depDetail210 = buildDepreciationDetail(data.depreciation?.business ?? [], DEP_TAGS_KOA210);
  const page3 = depDetail210 ? `<KOA210-3 page="3">${depDetail210}</KOA210-3>` : "";
  const page4 = buildBalanceSheetPage(data);
  return `<KOA210 VR="${vr}" id="KOA210" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA210-1 page="1">${parts.join("")}</KOA210-1>${page3}${page4}</KOA210>`;
}

// ---------------------------------------------------------------------------
// KOA220 青色申告決算書（不動産所得用）1ページ目
// ---------------------------------------------------------------------------

/** KOA220 の固定経費欄（勘定科目名 → タグ）。試算表も同じ並びを使うため export する。 */
export const KOA220_EXPENSE_LINES: [string, string][] = [
  ["租税公課", "ANF00130"],
  ["損害保険料", "ANF00140"],
  ["修繕費", "ANF00150"],
  ["減価償却費", "ANF00160"],
  ["利子割引料", "ANF00170"],
  ["地代家賃", "ANF00180"],
  ["給料賃金", "ANF00190"],
];

function buildKoa220(data: XtxFilingData, vr: string): string {
  const t = data.taxpayer;
  const f = data.figures;
  const totals = data.categoryTotals.realEstate;
  const rent = totals["家賃収入"] ?? 0;

  const parts: string[] = [];
  parts.push(ref("ANA00000", "NENBUN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(ref("ANB00010", "NOZEISHA_ADR"));
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("ANB00030", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("ANB00040", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<ANB00020>${nameParts.join("")}</ANB00020>`);
  if (t.occupation) taxpayer.push(ref("ANB00050", "SHOKUGYO"));
  if (taxpayer.length > 0) parts.push(`<ANB00000>${taxpayer.join("")}</ANB00000>`);
  if (toEraDate(data.submissionDate)) parts.push(ref("ANE00000", "TEISYUTSU_DAY"));

  const pl: string[] = [];
  pl.push(`<ANF00020><ANF00030><gen:mm>1</gen:mm><gen:dd>1</gen:dd></ANF00030><ANF00040><gen:mm>12</gen:mm><gen:dd>31</gen:dd></ANF00040></ANF00020>`);
  const extraRevenue = Math.max(f.real_estate_revenue - rent, 0);
  if (extraRevenue > 0) pl.push(`<ANF00050>その他収入</ANF00050>`);
  const revenueParts: string[] = [];
  revenueParts.push(amount("ANF00080", rent));
  revenueParts.push(amount("ANF00100", extraRevenue));
  revenueParts.push(amountAlways("ANF00110", f.real_estate_revenue));
  pl.push(`<ANF00070>${revenueParts.join("")}</ANF00070>`);

  const fixedAccounts = new Set(KOA220_EXPENSE_LINES.map(([account]) => account));
  const expenseLines: string[] = [];
  for (const [account, tag] of KOA220_EXPENSE_LINES) {
    expenseLines.push(amount(tag, totals[account] ?? 0));
  }
  const extras = Object.entries(totals).filter(
    ([account, value]) =>
      value > 0 && !fixedAccounts.has(account) && account !== "雑費" && account !== "家賃収入",
  );
  // 追加科目は様式の上限（ANF00195 の maxOccurs = 5）まで。超過分は雑費に合算する
  for (const [account, value] of extras.slice(0, 5)) {
    expenseLines.push(
      `<ANF00195><ANF00060>${esc(account)}</ANF00060>${amountAlways("ANF00200", value)}</ANF00195>`,
    );
  }
  const extrasOverflow = extras.slice(5).reduce((sum, [, value]) => sum + value, 0);
  expenseLines.push(amount("ANF00210", (totals["雑費"] ?? 0) + extrasOverflow));
  expenseLines.push(amountAlways("ANF00220", f.real_estate_expenses));
  pl.push(`<ANF00120>${expenseLines.join("")}</ANF00120>`);

  const beforeBlue = f._detail.real_estate_income_before_deduction;
  pl.push(amountAlways("ANF00230", beforeBlue));
  pl.push(amountAlways("ANF00250", beforeBlue));
  pl.push(amount("ANF00260", f._detail.blue_deduction_real_estate));
  pl.push(amountAlways("ANF00270", f._detail.real_estate_income));
  parts.push(`<ANF00000><ANF00010>${pl.join("")}</ANF00010></ANF00000>`);

  const depDetail220 = buildDepreciationDetail(data.depreciation?.realEstate ?? [], DEP_TAGS_KOA220);
  // 減価償却費の計算（ANF00880）は KOA220 の3ページ目の要素
  const page3_220 = depDetail220 ? `<KOA220-3 page="3">${depDetail220}</KOA220-3>` : "";
  return `<KOA220 VR="${vr}" id="KOA220" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA220-1 page="1">${parts.join("")}</KOA220-1>${page3_220}</KOA220>`;
}

// ---------------------------------------------------------------------------
// 収支内訳書（白色申告）KOA110 一般用 / KOA130 不動産所得用
// 項目対応は帳票フィールド仕様書（KOA110 Ver12 / KOA130 Ver9）で確認。
// 2面（明細書）は入力データを持たないため省略する（全要素 min=0）。
// ---------------------------------------------------------------------------

/** KOA110 の固定経費行（その他の経費グループ）: [科目名, タグ] */
const KOA110_OTHER_EXPENSE_LINES: [string, string][] = [
  ["租税公課", "AIG00220"],
  ["荷造運賃", "AIG00230"],
  ["水道光熱費", "AIG00240"],
  ["旅費交通費", "AIG00250"],
  ["通信費", "AIG00260"],
  ["広告宣伝費", "AIG00270"],
  ["交際費", "AIG00280"],
  ["損害保険料", "AIG00290"],
  ["修繕費", "AIG00300"],
  ["消耗品費", "AIG00310"],
  ["福利厚生費", "AIG00320"],
];

/** KOA110（収支内訳書・一般用、白色の事業所得）を組み立てる。 */
function buildKoa110(data: XtxFilingData, vr: string): string {
  const t = data.taxpayer;
  const f = data.figures;
  const totals = { ...data.categoryTotals.business };
  // 分類カテゴリの「外注工賃」は収支内訳書の固定行「外注費」に合算する
  if (totals["外注工賃"]) {
    totals["外注費"] = (totals["外注費"] ?? 0) + (totals["外注工賃"] ?? 0);
    totals["外注工賃"] = 0;
  }
  const purchases = totals["仕入高"] ?? 0;

  const parts: string[] = [];
  parts.push(ref("AIA00000", "NENBUN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(`<AIB00010>${esc(t.address)}</AIB00010>`);
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("AIB00030", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("AIB00040", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<AIB00020>${nameParts.join("")}</AIB00020>`);
  if (t.occupation) taxpayer.push(ref("AIB00090", "SHOKUGYO"));
  if (t.shopName) taxpayer.push(ref("AIB00100", "NOZEISHA_YAGO"));
  if (taxpayer.length > 0) parts.push(`<AIB00000>${taxpayer.join("")}</AIB00000>`);
  if (toEraDate(data.submissionDate)) parts.push(ref("AIE00000", "TEISYUTSU_DAY"));
  // 営業等（1）固定: 雑（業務）は雑所得側の様式で扱うため対象外
  parts.push(`<AIR00000><kubun_CD>1</kubun_CD></AIR00000>`);
  parts.push(
    `<AIF00000><AIF00010><gen:mm>1</gen:mm><gen:dd>1</gen:dd></AIF00010><AIF00020><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AIF00020></AIF00000>`,
  );

  const pl: string[] = [];
  const revenue: string[] = [];
  revenue.push(amountAlways("AIG00030", f.business_revenue));
  revenue.push(amountAlways("AIG00060", f.business_revenue));
  pl.push(`<AIG00020>${revenue.join("")}</AIG00020>`);
  if (purchases > 0) {
    pl.push(
      `<AIG00070>${amountAlways("AIG00090", purchases)}${amountAlways("AIG00100", purchases)}${amountAlways("AIG00120", purchases)}</AIG00070>`,
    );
  }
  pl.push(amountAlways("AIG00130", f.business_revenue - purchases));

  const mainExpenses: string[] = [];
  mainExpenses.push(amount("AIG00150", totals["給料賃金"] ?? 0));
  mainExpenses.push(amount("AIG00160", totals["外注費"] ?? 0));
  mainExpenses.push(amount("AIG00170", totals["減価償却費"] ?? 0));
  mainExpenses.push(amount("AIG00180", totals["貸倒金"] ?? 0));
  mainExpenses.push(amount("AIG00190", totals["地代家賃"] ?? 0));
  mainExpenses.push(amount("AIG00200", totals["利子割引料"] ?? 0));

  const otherLines: string[] = [];
  const fixedAccounts = new Set([
    ...KOA110_OTHER_EXPENSE_LINES.map(([account]) => account),
    "給料賃金", "外注費", "減価償却費", "貸倒金", "地代家賃", "利子割引料",
  ]);
  let otherSubtotal = 0;
  for (const [account, tag] of KOA110_OTHER_EXPENSE_LINES) {
    const value = totals[account] ?? 0;
    otherSubtotal += value;
    otherLines.push(amount(tag, value));
  }
  const extras = Object.entries(totals).filter(
    ([account, value]) =>
      value > 0 && !fixedAccounts.has(account) && account !== "仕入高" && account !== "売上高" && account !== "雑費",
  );
  // 追加科目は様式の上限（AIG00325 の maxOccurs = 5）まで。超過分は雑費に合算する
  for (const [account, value] of extras.slice(0, 5)) {
    otherSubtotal += value;
    otherLines.push(
      `<AIG00325><AIG00010>${esc(account)}</AIG00010>${amountAlways("AIG00330", value)}</AIG00325>`,
    );
  }
  const extrasOverflow = extras.slice(5).reduce((sum, [, value]) => sum + value, 0);
  const misc = (totals["雑費"] ?? 0) + extrasOverflow;
  otherSubtotal += misc;
  otherLines.push(amount("AIG00340", misc));
  otherLines.push(amountAlways("AIG00350", otherSubtotal));
  mainExpenses.push(`<AIG00210>${otherLines.join("")}</AIG00210>`);

  const expenseTotal = f.business_expenses - purchases;
  mainExpenses.push(amountAlways("AIG00360", expenseTotal));
  pl.push(`<AIG00140>${mainExpenses.join("")}</AIG00140>`);
  pl.push(amountAlways("AIG00370", f._detail.business_income_before_deduction));
  pl.push(amountAlways("AIG00400", f._detail.business_income));
  parts.push(`<AIG00000>${pl.join("")}</AIG00000>`);

  const depDetail110 = buildDepreciationDetail(data.depreciation?.business ?? [], DEP_TAGS_KOA110);
  const page2_110 = depDetail110 ? `<KOA110-2 page="2">${depDetail110}</KOA110-2>` : "";
  return `<KOA110 VR="${vr}" id="KOA110" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA110-1 page="1">${parts.join("")}</KOA110-1>${page2_110}</KOA110>`;
}

/** KOA130 の固定経費行（その他の経費グループ）: [科目名, タグ] */
const KOA130_OTHER_EXPENSE_LINES: [string, string][] = [
  ["租税公課", "AKG00160"],
  ["損害保険料", "AKG00170"],
  ["修繕費", "AKG00180"],
];

/** KOA130（収支内訳書・不動産所得用、白色の不動産所得）を組み立てる。 */
function buildKoa130(data: XtxFilingData, vr: string): string {
  const t = data.taxpayer;
  const f = data.figures;
  const totals = data.categoryTotals.realEstate;
  const rent = totals["家賃収入"] ?? 0;
  const otherIncome = Math.max(0, f.real_estate_revenue - rent);

  // 追加科目は様式上1件だけ（科目名 AKG00010 は様式先頭に1つ）。
  // 固定科目に当たらない経費の1件目を追加科目にし、2件目以降は雑費に合算する
  const fixedAccounts = new Set([
    ...KOA130_OTHER_EXPENSE_LINES.map(([account]) => account),
    "給料賃金", "減価償却費", "貸倒金", "地代家賃", "利子割引料",
  ]);
  const extras = Object.entries(totals).filter(
    ([account, value]) =>
      value > 0 && !fixedAccounts.has(account) && account !== "家賃収入" && account !== "雑費",
  );
  const extraName = extras.length > 0 ? extras[0][0] : null;
  const extraAmount = extras.length > 0 ? extras[0][1] : 0;
  let misc = totals["雑費"] ?? 0;
  for (const [, value] of extras.slice(1)) misc += value;

  const parts: string[] = [];
  parts.push(ref("AKA00000", "NENBUN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(ref("AKB00010", "NOZEISHA_ADR"));
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("AKB00030", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("AKB00040", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<AKB00020>${nameParts.join("")}</AKB00020>`);
  if (t.occupation) taxpayer.push(ref("AKB00050", "SHOKUGYO"));
  if (taxpayer.length > 0) parts.push(`<AKB00000>${taxpayer.join("")}</AKB00000>`);
  if (toEraDate(data.submissionDate)) parts.push(ref("AKE00000", "TEISYUTSU_DAY"));
  parts.push(
    `<AKF00000><AKF00010><gen:mm>1</gen:mm><gen:dd>1</gen:dd></AKF00010><AKF00020><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AKF00020></AKF00000>`,
  );

  const pl: string[] = [];
  if (extraName) pl.push(`<AKG00010>${esc(extraName)}</AKG00010>`);
  const revenue: string[] = [];
  revenue.push(amountAlways("AKG00030", rent));
  const other: string[] = [];
  if (otherIncome > 0) other.push(amountAlways("AKG00060", otherIncome));
  other.push(amountAlways("AKG00070", otherIncome));
  revenue.push(`<AKG00040>${other.join("")}</AKG00040>`);
  revenue.push(amountAlways("AKG00080", f.real_estate_revenue));
  pl.push(`<AKG00020>${revenue.join("")}</AKG00020>`);

  const expenses: string[] = [];
  expenses.push(amount("AKG00100", totals["給料賃金"] ?? 0));
  expenses.push(amount("AKG00110", totals["減価償却費"] ?? 0));
  expenses.push(amount("AKG00120", totals["貸倒金"] ?? 0));
  expenses.push(amount("AKG00130", totals["地代家賃"] ?? 0));
  expenses.push(amount("AKG00140", totals["利子割引料"] ?? 0));

  const otherLines: string[] = [];
  let otherSubtotal = 0;
  for (const [account, tag] of KOA130_OTHER_EXPENSE_LINES) {
    const value = totals[account] ?? 0;
    otherSubtotal += value;
    otherLines.push(amount(tag, value));
  }
  if (extraName) {
    otherSubtotal += extraAmount;
    otherLines.push(amountAlways("AKG00190", extraAmount));
  }
  otherSubtotal += misc;
  otherLines.push(amount("AKG00200", misc));
  otherLines.push(amountAlways("AKG00210", otherSubtotal));
  expenses.push(`<AKG00150>${otherLines.join("")}</AKG00150>`);
  expenses.push(amountAlways("AKG00220", f.real_estate_expenses));
  pl.push(`<AKG00090>${expenses.join("")}</AKG00090>`);
  pl.push(amountAlways("AKG00230", f._detail.real_estate_income_before_deduction));
  pl.push(amountAlways("AKG00250", f._detail.real_estate_income));
  parts.push(`<AKG00000>${pl.join("")}</AKG00000>`);

  const depDetail = buildDepreciationDetail(data.depreciation?.realEstate ?? [], DEP_TAGS_KOA130);
  const page2 = depDetail ? `<KOA130-2 page="2">${depDetail}</KOA130-2>` : "";
  return `<KOA130 VR="${vr}" id="KOA130" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA130-1 page="1">${parts.join("")}</KOA130-1>${page2}</KOA130>`;
}

// ---------------------------------------------------------------------------
// 農業所得用様式（Issue #24 Phase 1）
// KOA240 青色申告決算書（農業所得用） / KOA120 収支内訳書（農業所得用）。
// 項目対応は同梱XSD（KOA240 VR8.0 / KOA120 VR9.0）の appinfo で確認した。
// 1面（損益計算書）と減価償却費の計算のみを出力し、2面（収入金額の内訳等）・
// 育成費用の計算・貸借対照表（KOA240 4面）は Phase 1 では省略する
// （対象要素は全て min=0）。
// ---------------------------------------------------------------------------

/** KOA240 の固定経費行のタグ（AGRICULTURE_BLUE_EXPENSE_CATEGORIES と同じ並び） */
const KOA240_EXPENSE_TAGS: string[] = [
  "APF00200", "APF00210", "APF00220", "APF00230", "APF00240", "APF00250",
  "APF00260", "APF00270", "APF00280", "APF00290", "APF00300", "APF00310",
  "APF00320", "APF00330", "APF00340", "APF00350", "APF00360", "APF00370",
];

/** KOA240 の固定経費行: [科目名, タグ]（様式の並び順） */
const KOA240_EXPENSE_LINES: [string, string][] = AGRICULTURE_BLUE_EXPENSE_CATEGORIES.map(
  (category, i) => [category, KOA240_EXPENSE_TAGS[i] as string],
);

/** KOA240（青色申告決算書・農業所得用）を組み立てる。 */
function buildKoa240(data: XtxFilingData, vr: string): string {
  const t = data.taxpayer;
  const agriculture = data.agriculture;
  if (!agriculture) return "";
  const stmt = agriculture.statement;

  const parts: string[] = [];
  parts.push(ref("APA00000", "NENBUN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(ref("APB00010", "NOZEISHA_ADR"));
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("APB00030", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("APB00040", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<APB00020>${nameParts.join("")}</APB00020>`);
  if (t.occupation) taxpayer.push(ref("APB00050", "SHOKUGYO"));
  if (stmt.farmName) taxpayer.push(`<APB00060>${esc(stmt.farmName)}</APB00060>`);
  if (phoneXml(t.phone)) taxpayer.push(ref("APB00070", "NOZEISHA_TEL"));
  if (taxpayer.length > 0) parts.push(`<APB00000>${taxpayer.join("")}</APB00000>`);
  if (toEraDate(data.submissionDate)) parts.push(ref("APE00000", "TEISYUTSU_DAY"));

  const amounts: string[] = [];
  const revenue: string[] = [];
  revenue.push(amount("APF00110", stmt.salesAmount));
  revenue.push(amount("APF00120", stmt.householdConsumption));
  revenue.push(amount("APF00130", stmt.miscRevenue));
  revenue.push(amountAlways("APF00140", stmt.revenueSubtotal));
  if (stmt.produceOpeningInventory || stmt.produceClosingInventory) {
    revenue.push(
      `<APF00150>${amount("APF00160", stmt.produceOpeningInventory)}${amount("APF00170", stmt.produceClosingInventory)}</APF00150>`,
    );
  }
  revenue.push(amountAlways("APF00180", stmt.revenueTotal));
  amounts.push(`<APF00100>${revenue.join("")}</APF00100>`);

  const expense: string[] = [];
  const blueAmounts = new Map(stmt.blueExpenseRows.map((row) => [row.category, row.amount]));
  for (const [category, tag] of KOA240_EXPENSE_LINES) {
    expense.push(amount(tag, blueAmounts.get(category) ?? 0));
  }
  for (const extra of stmt.blueExtraExpenses) {
    expense.push(
      `<APF00375><APF00060>${esc(extra.category)}</APF00060>${amountAlways("APF00380", extra.amount)}</APF00375>`,
    );
  }
  expense.push(amount("APF00390", stmt.blueMiscExpense));
  expense.push(amountAlways("APF00400", stmt.expensesSubtotal));
  if (stmt.otherOpeningInventory || stmt.otherClosingInventory) {
    expense.push(
      `<APF00410>${amount("APF00420", stmt.otherOpeningInventory)}${amount("APF00430", stmt.otherClosingInventory)}</APF00410>`,
    );
  }
  amounts.push(`<APF00190>${expense.join("")}</APF00190>`);
  amounts.push(amount("APF00440", stmt.cultivationCostDeduction));
  amounts.push(amountAlways("APF00450", stmt.expensesTotal));
  amounts.push(amountAlways("APF00460", stmt.balanceAmount));

  const back: string[] = [];
  back.push(amount("APF00490", stmt.badDebtProvisionBack));
  back.push(amountAlways("APF00510", stmt.provisionBackTotal));
  const into: string[] = [];
  into.push(amount("APF00530", stmt.familyWorkerSalary));
  into.push(amount("APF00540", stmt.badDebtProvisionIn));
  into.push(amountAlways("APF00560", stmt.provisionInTotal));
  amounts.push(
    `<APF00470><APF00480>${back.join("")}</APF00480><APF00520>${into.join("")}</APF00520></APF00470>`,
  );

  const beforeBlue = agricultureIncomeBeforeBlueDeduction(stmt, false);
  amounts.push(amountAlways("APF00570", beforeBlue));
  amounts.push(amount("APF00580", agriculture.blueDeduction));
  amounts.push(amountAlways("APF00600", beforeBlue - agriculture.blueDeduction));
  amounts.push(amount("APF00610", stmt.beefCattleExemptionAmount));

  parts.push(
    `<APF00000><APF00010><APF00020><APF00030><gen:mm>1</gen:mm><gen:dd>1</gen:dd></APF00030><APF00040><gen:mm>12</gen:mm><gen:dd>31</gen:dd></APF00040></APF00020><APF00090>${amounts.join("")}</APF00090></APF00010></APF00000>`,
  );

  const depDetail240 = buildDepreciationDetail(
    data.depreciation?.agriculture ?? [],
    DEP_TAGS_KOA240,
  );
  const page3 = depDetail240 ? `<KOA240-3 page="3">${depDetail240}</KOA240-3>` : "";
  return `<KOA240 VR="${vr}" id="KOA240" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA240-1 page="1">${parts.join("")}</KOA240-1>${page3}</KOA240>`;
}

/** KOA120 の経費の先頭の独立行: [科目名, タグ]。「地代賃借料」は様式の「小作料・賃借料」行。 */
const KOA120_TOP_EXPENSE_LINES: [string, string][] = [
  ["雇人費", "AJG00120"],
  ["地代賃借料", "AJG00130"],
  ["減価償却費", "AJG00140"],
  ["貸倒金", "AJG00150"],
  ["利子割引料", "AJG00160"],
];

/** KOA120 の「その他の経費」の固定行のタグ（AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES と同じ並び） */
const KOA120_OTHER_EXPENSE_TAGS: string[] = [
  "AJG00180", "AJG00190", "AJG00200", "AJG00210", "AJG00220", "AJG00230",
  "AJG00240", "AJG00250", "AJG00260", "AJG00270", "AJG00280", "AJG00290",
  "AJG00300", "AJG00310",
];

/** KOA120 の「その他の経費」の固定行: [科目名, タグ]（様式の並び順） */
const KOA120_OTHER_EXPENSE_LINES: [string, string][] =
  AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES.map(
    (category, i) => [category, KOA120_OTHER_EXPENSE_TAGS[i] as string],
  );

/** KOA120（収支内訳書・農業所得用）を組み立てる。 */
function buildKoa120(data: XtxFilingData, vr: string): string {
  const t = data.taxpayer;
  const agriculture = data.agriculture;
  if (!agriculture) return "";
  const stmt = agriculture.statement;

  const parts: string[] = [];
  parts.push(ref("AJA00000", "NENBUN"));
  const taxpayer: string[] = [];
  if (t.address) taxpayer.push(ref("AJB00010", "NOZEISHA_ADR"));
  const nameParts: string[] = [];
  if (t.nameKana) nameParts.push(ref("AJB00030", "NOZEISHA_NM_KN"));
  if (t.name) nameParts.push(ref("AJB00040", "NOZEISHA_NM"));
  if (nameParts.length > 0) taxpayer.push(`<AJB00020>${nameParts.join("")}</AJB00020>`);
  if (t.occupation) taxpayer.push(ref("AJB00050", "SHOKUGYO"));
  if (stmt.farmName) taxpayer.push(`<AJB00060>${esc(stmt.farmName)}</AJB00060>`);
  if (phoneXml(t.phone)) taxpayer.push(ref("AJB00070", "NOZEISHA_TEL"));
  if (taxpayer.length > 0) parts.push(`<AJB00000>${taxpayer.join("")}</AJB00000>`);
  if (toEraDate(data.submissionDate)) parts.push(ref("AJE00000", "TEISYUTSU_DAY"));
  parts.push(
    `<AJF00000><AJF00010><gen:mm>1</gen:mm><gen:dd>1</gen:dd></AJF00010><AJF00020><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AJF00020></AJF00000>`,
  );

  const pl: string[] = [];
  const revenue: string[] = [];
  revenue.push(amount("AJG00030", stmt.salesAmount));
  revenue.push(amount("AJG00040", stmt.householdConsumption));
  revenue.push(amount("AJG00050", stmt.miscRevenue));
  revenue.push(amountAlways("AJG00060", stmt.revenueSubtotal));
  if (stmt.produceOpeningInventory || stmt.produceClosingInventory) {
    revenue.push(
      `<AJG00070>${amount("AJG00080", stmt.produceOpeningInventory)}${amount("AJG00090", stmt.produceClosingInventory)}</AJG00070>`,
    );
  }
  revenue.push(amountAlways("AJG00100", stmt.revenueTotal));
  pl.push(`<AJG00020>${revenue.join("")}</AJG00020>`);

  const expenses: string[] = [];
  const topAmounts = new Map(stmt.whiteTopExpenseRows.map((row) => [row.category, row.amount]));
  for (const [category, tag] of KOA120_TOP_EXPENSE_LINES) {
    expenses.push(amount(tag, topAmounts.get(category) ?? 0));
  }
  const other: string[] = [];
  const otherAmounts = new Map(
    stmt.whiteOtherExpenseRows.map((row) => [row.category, row.amount]),
  );
  for (const [category, tag] of KOA120_OTHER_EXPENSE_LINES) {
    other.push(amount(tag, otherAmounts.get(category) ?? 0));
  }
  for (const extra of stmt.whiteExtraExpenses) {
    other.push(
      `<AJG00315><AJG00010>${esc(extra.category)}</AJG00010>${amountAlways("AJG00320", extra.amount)}</AJG00315>`,
    );
  }
  other.push(amount("AJG00330", stmt.whiteMiscExpense));
  if (stmt.otherOpeningInventory || stmt.otherClosingInventory) {
    other.push(
      `<AJG00340>${amount("AJG00350", stmt.otherOpeningInventory)}${amount("AJG00360", stmt.otherClosingInventory)}</AJG00340>`,
    );
  }
  other.push(amount("AJG00370", stmt.cultivationCostDeduction));
  other.push(amountAlways("AJG00380", stmt.whiteOtherExpensesSubtotal));
  expenses.push(`<AJG00170>${other.join("")}</AJG00170>`);
  expenses.push(amountAlways("AJG00390", stmt.expensesTotal));
  pl.push(`<AJG00110>${expenses.join("")}</AJG00110>`);
  pl.push(amountAlways("AJG00400", stmt.balanceAmount));
  pl.push(amount("AJG00410", stmt.familyWorkerDeduction));
  pl.push(amountAlways("AJG00430", stmt.balanceAmount - stmt.familyWorkerDeduction));
  pl.push(amount("AJG00440", stmt.beefCattleExemptionAmount));
  parts.push(`<AJG00000>${pl.join("")}</AJG00000>`);

  const depDetail120 = buildDepreciationDetail(
    data.depreciation?.agriculture ?? [],
    DEP_TAGS_KOA120,
  );
  const page2 = depDetail120 ? `<KOA120-2 page="2">${depDetail120}</KOA120-2>` : "";
  return `<KOA120 VR="${vr}" id="KOA120" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA120-1 page="1">${parts.join("")}</KOA120-1>${page2}</KOA120>`;
}

// ---------------------------------------------------------------------------
// 減価償却費の計算（明細）と貸借対照表
// ---------------------------------------------------------------------------

/** 様式ごとの減価償却明細のタグ対応 */
interface DepDetailTags {
  /** 明細行の maxOccurs（同梱 XSD）。超過分は様式に載せられないため例外にする */
  maxRows: number;
  group: string;
  row: string;
  name: string;
  quantity: string;
  acquisition: string;
  cost: string;
  guarantee: string;
  basis: string;
  method: string;
  life: string;
  rateWrap: string;
  rate: string;
  months: string;
  ordinary: string;
  special: string;
  total: string;
  ratio: string;
  deductible: string;
  closing: string;
  totalsWrap: string;
  tOrdinary: string;
  tSpecial: string;
  tTotal: string;
  tDeductible: string;
  tClosing: string;
}

const DEP_TAGS_KOA210: DepDetailTags = {
  maxRows: 7,
  group: "AMF01590", row: "AMF01600", name: "AMF01610", quantity: "AMF01620",
  acquisition: "AMF01630", cost: "AMF01640", guarantee: "AMF01645", basis: "AMF01650",
  method: "AMF01660", life: "AMF01670", rateWrap: "AMF01680", rate: "AMF01690",
  months: "AMF01720", ordinary: "AMF01730", special: "AMF01740", total: "AMF01750",
  ratio: "AMF01760", deductible: "AMF01770", closing: "AMF01780",
  totalsWrap: "AMF01800", tOrdinary: "AMF01810", tSpecial: "AMF01820",
  tTotal: "AMF01830", tDeductible: "AMF01840", tClosing: "AMF01850",
};

const DEP_TAGS_KOA220: DepDetailTags = {
  maxRows: 13,
  group: "ANF00880", row: "ANF00890", name: "ANF00900", quantity: "ANF00910",
  acquisition: "ANF00920", cost: "ANF00930", guarantee: "ANF00935", basis: "ANF00940",
  method: "ANF00950", life: "ANF00960", rateWrap: "ANF00970", rate: "ANF00980",
  months: "ANF01010", ordinary: "ANF01020", special: "ANF01030", total: "ANF01040",
  ratio: "ANF01050", deductible: "ANF01060", closing: "ANF01070",
  totalsWrap: "ANF01090", tOrdinary: "ANF01100", tSpecial: "ANF01110",
  tTotal: "ANF01120", tDeductible: "ANF01130", tClosing: "ANF01140",
};

const DEP_TAGS_KOA110: DepDetailTags = {
  maxRows: 6,
  group: "AIM00000", row: "AIM00010", name: "AIM00020", quantity: "AIM00030",
  acquisition: "AIM00050", cost: "AIM00060", guarantee: "AIM00065", basis: "AIM00070",
  method: "AIM00080", life: "AIM00090", rateWrap: "AIM00100", rate: "AIM00110",
  months: "AIM00140", ordinary: "AIM00150", special: "AIM00160", total: "AIM00170",
  ratio: "AIM00180", deductible: "AIM00190", closing: "AIM00200",
  totalsWrap: "AIM00220", tOrdinary: "AIM00230", tSpecial: "AIM00240",
  tTotal: "AIM00250", tDeductible: "AIM00260", tClosing: "AIM00270",
};

const DEP_TAGS_KOA130: DepDetailTags = {
  maxRows: 8,
  group: "AKK00000", row: "AKK00010", name: "AKK00020", quantity: "AKK00030",
  acquisition: "AKK00050", cost: "AKK00060", guarantee: "AKK00065", basis: "AKK00070",
  method: "AKK00080", life: "AKK00090", rateWrap: "AKK00100", rate: "AKK00110",
  months: "AKK00140", ordinary: "AKK00150", special: "AKK00160", total: "AKK00170",
  ratio: "AKK00180", deductible: "AKK00190", closing: "AKK00200",
  totalsWrap: "AKK00220", tOrdinary: "AKK00230", tSpecial: "AKK00240",
  tTotal: "AKK00250", tDeductible: "AKK00260", tClosing: "AKK00270",
};

const DEP_TAGS_KOA240: DepDetailTags = {
  maxRows: 12,
  group: "APF02030", row: "APF02040", name: "APF02050", quantity: "APF02060",
  acquisition: "APF02070", cost: "APF02080", guarantee: "APF02085", basis: "APF02090",
  method: "APF02100", life: "APF02110", rateWrap: "APF02120", rate: "APF02130",
  months: "APF02160", ordinary: "APF02170", special: "APF02180", total: "APF02190",
  ratio: "APF02200", deductible: "APF02210", closing: "APF02220",
  totalsWrap: "APF02240", tOrdinary: "APF02250", tSpecial: "APF02260",
  tTotal: "APF02270", tDeductible: "APF02280", tClosing: "APF02290",
};

const DEP_TAGS_KOA120: DepDetailTags = {
  maxRows: 7,
  group: "AJL00000", row: "AJL00010", name: "AJL00020", quantity: "AJL00030",
  acquisition: "AJL00050", cost: "AJL00060", guarantee: "AJL00065", basis: "AJL00070",
  method: "AJL00080", life: "AJL00090", rateWrap: "AJL00100", rate: "AJL00110",
  months: "AJL00140", ordinary: "AJL00150", special: "AJL00160", total: "AJL00170",
  ratio: "AJL00180", deductible: "AJL00190", closing: "AJL00200",
  totalsWrap: "AJL00220", tOrdinary: "AJL00230", tSpecial: "AJL00240",
  tTotal: "AJL00250", tDeductible: "AJL00260", tClosing: "AJL00270",
};

/** 取得年月を era + yy + mm の複合型で出す。 */
function eraYearMonthTag(tag: string, yearMonth: string): string {
  const era = toEraDate(`${yearMonth}-01`);
  if (!era) return "";
  return `<${tag}><gen:era>${era.era}</gen:era><gen:yy>${era.yy}</gen:yy><gen:mm>${era.mm}</gen:mm></${tag}>`;
}

/** 減価償却費の計算グループ（明細行＋計）を組み立てる。 */
function buildDepreciationDetail(rows: DepreciationDetailRow[], tags: DepDetailTags): string {
  if (rows.length === 0) return "";
  if (rows.length > tags.maxRows) {
    throw new Error(
      `減価償却費の計算明細は様式の上限 ${tags.maxRows} 件までです（${rows.length} 件指定）。明細をまとめてから出力してください`,
    );
  }
  const body: string[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    cells.push(`<${tags.name}>${esc(row.name)}</${tags.name}>`);
    if (row.quantity) cells.push(`<${tags.quantity}>${esc(row.quantity)}</${tags.quantity}>`);
    cells.push(eraYearMonthTag(tags.acquisition, row.acquisitionYearMonth));
    cells.push(amountAlways(tags.cost, row.cost));
    if (row.guaranteeAmount !== null) cells.push(amountAlways(tags.guarantee, row.guaranteeAmount));
    cells.push(amountAlways(tags.basis, row.basisAmount));
    cells.push(`<${tags.method}>${esc(row.methodLabel)}</${tags.method}>`);
    if (row.method === "straight_line" || row.method === "declining_balance") {
      cells.push(`<${tags.life}>${row.usefulLifeYears}</${tags.life}>`);
      cells.push(
        `<${tags.rateWrap}><${tags.rate}>${row.rate.toFixed(3)}</${tags.rate}></${tags.rateWrap}>`,
      );
    }
    cells.push(`<${tags.months}>${row.months}</${tags.months}>`);
    cells.push(amountAlways(tags.ordinary, row.ordinary));
    cells.push(amountAlways(tags.total, row.total));
    cells.push(`<${tags.ratio}>${row.businessRatioPercent}</${tags.ratio}>`);
    cells.push(amountAlways(tags.deductible, row.deductible));
    cells.push(amountAlways(tags.closing, row.closingBookValue));
    body.push(`<${tags.row}>${cells.join("")}</${tags.row}>`);
  }
  const sum = (pick: (r: DepreciationDetailRow) => number) =>
    rows.reduce((acc, r) => acc + pick(r), 0);
  body.push(
    `<${tags.totalsWrap}>` +
      amountAlways(tags.tOrdinary, sum((r) => r.ordinary)) +
      amountAlways(tags.tTotal, sum((r) => r.total)) +
      amountAlways(tags.tDeductible, sum((r) => r.deductible)) +
      amountAlways(tags.tClosing, sum((r) => r.closingBookValue)) +
      `</${tags.totalsWrap}>`,
  );
  return `<${tags.group}>${body.join("")}</${tags.group}>`;
}

/** 貸借対照表の資産勘定: [キー, 期首タグ, 期末タグ]。試算表も同じ並びを使うため export する。 */
export const BS_ASSET_ACCOUNTS: [BalanceSheetAccount, string, string][] = [
  ["cash", "AMG00060", "AMG00260"],
  ["checking_deposit", "AMG00070", "AMG00270"],
  ["time_deposit", "AMG00080", "AMG00280"],
  ["other_deposit", "AMG00090", "AMG00290"],
  ["notes_receivable", "AMG00100", "AMG00300"],
  ["accounts_receivable", "AMG00110", "AMG00310"],
  ["securities", "AMG00120", "AMG00320"],
  ["inventory", "AMG00130", "AMG00330"],
  ["prepaid_expenses", "AMG00140", "AMG00340"],
  ["loans_receivable", "AMG00150", "AMG00350"],
  ["buildings", "AMG00160", "AMG00360"],
  ["building_equipment", "AMG00170", "AMG00370"],
  ["machinery", "AMG00180", "AMG00380"],
  ["vehicles", "AMG00190", "AMG00390"],
  ["tools_equipment", "AMG00200", "AMG00400"],
  ["land", "AMG00210", "AMG00410"],
];

/** 貸借対照表の負債勘定（貸倒引当金・元入金は別枠）: [キー, 期首タグ, 期末タグ]。試算表も同じ並びを使うため export する。 */
export const BS_LIABILITY_ACCOUNTS: [BalanceSheetAccount, string, string][] = [
  ["notes_payable", "AMG00510", "AMG00640"],
  ["accounts_payable", "AMG00520", "AMG00650"],
  ["borrowings", "AMG00530", "AMG00660"],
  ["other_payables", "AMG00540", "AMG00670"],
  ["advances_received", "AMG00550", "AMG00680"],
  ["deposits_received", "AMG00560", "AMG00690"],
];

/**
 * KOA210-4（貸借対照表）を組み立てる。
 * 元入金は期首・期末とも期首元入金の額を書く様式で、期末の合計は
 * 期末負債合計 + 事業主借 + 期首元入金 + 青色申告特別控除前の所得金額
 * とし、資産側の期末合計（事業主貸を含む）と一致させる。
 * 貸借が一致しない入力は例外にする（不整合な決算書を出さない）。
 */
function buildBalanceSheetPage(data: XtxFilingData): string {
  const bs = data.balanceSheet;
  if (!bs) return "";
  const opening = bs.opening;
  const closing = bs.closing;
  const sumOf = (
    side: Partial<Record<BalanceSheetAccount, number>>,
    accounts: [BalanceSheetAccount, string, string][],
  ) => accounts.reduce((acc, [key]) => acc + (side[key] ?? 0), 0);

  const openingAssets = sumOf(opening, BS_ASSET_ACCOUNTS) + (bs.extraAsset?.opening ?? 0);
  const closingAssets =
    sumOf(closing, BS_ASSET_ACCOUNTS) + (bs.extraAsset?.closing ?? 0) + bs.ownerLoan;
  const openingLiabilities =
    sumOf(opening, BS_LIABILITY_ACCOUNTS) +
    (opening.allowance_for_doubtful_accounts ?? 0) +
    (bs.extraLiability1?.opening ?? 0) +
    (bs.extraLiability2?.opening ?? 0);
  const closingLiabilities =
    sumOf(closing, BS_LIABILITY_ACCOUNTS) +
    (closing.allowance_for_doubtful_accounts ?? 0) +
    (bs.extraLiability1?.closing ?? 0) +
    (bs.extraLiability2?.closing ?? 0);
  const openingCapital = opening.capital ?? 0;
  const incomeBeforeBlue = data.figures._detail.business_income_before_deduction;
  // 期末の負債・資本合計 = 期末負債合計 + 事業主借 + 期首元入金 + 所得
  const closingTotal =
    closingLiabilities + bs.ownerBorrowing + openingCapital + incomeBeforeBlue;

  if (openingAssets !== openingLiabilities + openingCapital) {
    throw new Error(
      `貸借対照表（期首）が貸借一致しません: 資産 ${openingAssets} ≠ 負債・資本 ${openingLiabilities + openingCapital}`,
    );
  }
  if (closingAssets !== closingTotal) {
    throw new Error(
      `貸借対照表（期末）が貸借一致しません: 資産 ${closingAssets} ≠ 負債・資本 ${closingTotal}`,
    );
  }

  const era = toEraDate(`${data.year}-12-31`);
  const parts: string[] = [];
  if (era) {
    parts.push(
      `<AMG00010><gen:era>${era.era}</gen:era><gen:yy>${era.yy}</gen:yy><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AMG00010>`,
    );
  }
  const assetSide: string[] = [];
  if (bs.extraAsset) {
    assetSide.push(
      `<AMG00025><AMG00030>${esc(bs.extraAsset.name)}</AMG00030>` +
        amountAlways("AMG00220", bs.extraAsset.opening) +
        amountAlways("AMG00420", bs.extraAsset.closing) +
        `</AMG00025>`,
    );
  }
  const openingCells: string[] = [`<AMG00050><gen:mm>1</gen:mm><gen:dd>1</gen:dd></AMG00050>`];
  for (const [key, openTag] of BS_ASSET_ACCOUNTS) openingCells.push(amount(openTag, opening[key] ?? 0));
  openingCells.push(amountAlways("AMG00230", openingAssets));
  assetSide.push(`<AMG00040>${openingCells.join("")}</AMG00040>`);
  const closingCells: string[] = [`<AMG00250><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AMG00250>`];
  for (const [key, , closeTag] of BS_ASSET_ACCOUNTS) closingCells.push(amount(closeTag, closing[key] ?? 0));
  closingCells.push(amount("AMG00430", bs.ownerLoan));
  closingCells.push(amountAlways("AMG00440", closingAssets));
  assetSide.push(`<AMG00240>${closingCells.join("")}</AMG00240>`);
  parts.push(`<AMG00020>${assetSide.join("")}</AMG00020>`);

  const liabilitySide: string[] = [];
  const extras: string[] = [];
  if (bs.extraLiability1) {
    extras.push(
      `<AMG00465><AMG00470>${esc(bs.extraLiability1.name)}</AMG00470>` +
        amountAlways("AMG00570", bs.extraLiability1.opening) +
        amountAlways("AMG00700", bs.extraLiability1.closing) +
        `</AMG00465>`,
    );
  }
  if (bs.extraLiability2) {
    extras.push(
      `<AMG00475><AMG00480>${esc(bs.extraLiability2.name)}</AMG00480>` +
        amountAlways("AMG00590", bs.extraLiability2.opening) +
        amountAlways("AMG00720", bs.extraLiability2.closing) +
        `</AMG00475>`,
    );
  }
  if (extras.length > 0) liabilitySide.push(`<AMG00460>${extras.join("")}</AMG00460>`);
  const openingL: string[] = [`<AMG00500><gen:mm>1</gen:mm><gen:dd>1</gen:dd></AMG00500>`];
  for (const [key, openTag] of BS_LIABILITY_ACCOUNTS) openingL.push(amount(openTag, opening[key] ?? 0));
  openingL.push(amount("AMG00580", opening.allowance_for_doubtful_accounts ?? 0));
  openingL.push(amountAlways("AMG00600", openingCapital));
  openingL.push(amountAlways("AMG00610", openingLiabilities + openingCapital));
  liabilitySide.push(`<AMG00490>${openingL.join("")}</AMG00490>`);
  const closingL: string[] = [`<AMG00630><gen:mm>12</gen:mm><gen:dd>31</gen:dd></AMG00630>`];
  for (const [key, , closeTag] of BS_LIABILITY_ACCOUNTS) closingL.push(amount(closeTag, closing[key] ?? 0));
  closingL.push(amount("AMG00710", closing.allowance_for_doubtful_accounts ?? 0));
  closingL.push(amount("AMG00730", bs.ownerBorrowing));
  // 元入金は期末欄にも期首元入金の額を書く（様式の取扱い）
  closingL.push(amountAlways("AMG00740", openingCapital));
  closingL.push(amountAlways("AMG00750", incomeBeforeBlue));
  closingL.push(amountAlways("AMG00760", closingTotal));
  liabilitySide.push(`<AMG00620>${closingL.join("")}</AMG00620>`);
  parts.push(`<AMG00450>${liabilitySide.join("")}</AMG00450>`);

  return `<KOA210-4 page="4"><AMG00000>${parts.join("")}</AMG00000></KOA210-4>`;
}

// ---------------------------------------------------------------------------
// 全体
// ---------------------------------------------------------------------------

/**
 * 申告等データ（XTX）を生成する。対応外の年分は例外を投げる。
 * 生成物は署名なしの組み込み用データで、送信は e-Tax 側で本人が行う。
 */
export function buildXtxFiling(data: XtxFilingData): string {
  const versions = YEAR_VERSIONS[data.year];
  if (!versions) {
    throw new Error(
      `XTX出力に対応していない年分です: ${data.year}（対応: ${xtxSupportedYears().join(", ")}）`,
    );
  }
  // 納税者情報は正規化＋完全性検証を通してから使う。欠けていれば例外で止まり、
  // 部分的なXTXは決して出ない（taxpayerNormalize が恒常対策の正本）。
  const taxpayer = normalizeXtxTaxpayer(data.taxpayer, {
    submissionDate: data.submissionDate,
    periodFrom: null,
    periodTo: null,
    filingKind: null,
  });
  const normalized: XtxFilingData = { ...data, taxpayer };
  const t = taxpayer;
  const forms: { id: string; xml: string }[] = [];
  forms.push({
    id: "KOA020",
    xml:
      `<KOA020 VR="${versions.koa020}" id="KOA020" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku">${buildKoa020Face1(normalized)}${buildKoa020Face2(normalized)}${buildKoa020Face3(normalized)}</KOA020>`,
  });
  // 白色申告では青色申告決算書は添付せず、収支内訳書を添付する
  // （従来は申告種別によらず決算書が含まれていた不整合をここで解消）。
  const white = data.filingType === "white";
  if (data.figures.business_revenue > 0 || data.figures.business_expenses > 0) {
    forms.push(
      white
        ? { id: "KOA110", xml: buildKoa110(normalized, versions.koa110) }
        : { id: "KOA210", xml: buildKoa210(normalized, versions.koa210) },
    );
  }
  // 農業所得がある場合は農業所得用の様式を添付する（Issue #24）。
  // 農業分は一般用の決算書には混ぜず、専用様式でのみ申告する。
  // 農業区分の固定資産だけがある場合も、減価償却明細を落とさないよう
  // 空の決算書で様式を添付する（事業所得側の明細添付と同じ扱い）。
  const agricultureDepRows = data.depreciation?.agriculture ?? [];
  let agricultureData = normalized;
  if (!agricultureData.agriculture && agricultureDepRows.length > 0) {
    agricultureData = {
      ...normalized,
      agriculture: {
        statement: computeAgricultureStatement(EMPTY_AGRICULTURE_INPUT),
        blueDeduction: 0,
      },
    };
  }
  const agricultureStatement = agricultureData.agriculture?.statement;
  if (
    agricultureStatement &&
    (agricultureStatement.revenueTotal !== 0 ||
      agricultureStatement.expensesTotal !== 0 ||
      agricultureStatement.beefCattleExemptionAmount !== 0 ||
      agricultureDepRows.length > 0)
  ) {
    forms.push(
      white
        ? { id: "KOA120", xml: buildKoa120(agricultureData, versions.koa120) }
        : { id: "KOA240", xml: buildKoa240(agricultureData, versions.koa240) },
    );
  }
  if (data.figures.real_estate_revenue > 0 || data.figures.real_estate_expenses > 0) {
    forms.push(
      white
        ? { id: "KOA130", xml: buildKoa130(normalized, versions.koa130) }
        : { id: "KOA220", xml: buildKoa220(normalized, versions.koa220) },
    );
  }
  // 株式等に係る譲渡所得等の金額の計算明細書（KOC080）: 株式等譲渡の
  // 入力がある場合に添付する（Issue #27 Phase C）
  const koc080 = buildKoc080(normalized, versions.koc080);
  if (koc080) forms.push({ id: "KOC080", xml: koc080 });

  const catalog =
    `<CATALOG id="CATALOG">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description ID="REPORT">` +
    `<SEND_DATA/>` +
    `<IT_SEC/>` +
    `<FORM_SEC><rdf:Seq>${forms.map((f) => `<rdf:li>${f.id}</rdf:li>`).join("")}</rdf:Seq></FORM_SEC>` +
    `<TENPU_SEC/>` +
    `<XBRL_SEC/>` +
    `<XBRL2_1_SEC/>` +
    `<SOFUSHO_SEC/>` +
    `<ATTACH_SEC/>` +
    `<CSV_SEC/>` +
    `</rdf:Description></rdf:RDF></CATALOG>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<DATA id="DATA" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku">` +
    `<RKO0010 VR="${versions.procedure}" id="RKO0010" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku" xmlns:gen="http://xml.e-tax.nta.go.jp/XSD/general">` +
    catalog +
    `<CONTENTS id="CONTENTS">${buildIt(normalized)}${forms.map((f) => f.xml).join("")}</CONTENTS>` +
    `</RKO0010></DATA>`
  );
}
