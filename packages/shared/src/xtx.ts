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
import { DeductionInputs, IncomeTaxResult, MiscIncomeInput } from "./deductions";
import { CorrectedFigures } from "./taxcalc";
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
  /** 雑所得（その他）の入力。第一表ク・⑨・⑩に出力する。 */
  miscIncome: MiscIncomeInput;
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
}

interface YearVersions {
  procedure: string;
  koa020: string;
  koa210: string;
  koa220: string;
}

/**
 * 年分 → 手続・様式バージョン（手続内帳票対応表の組）。対応外の年は生成できない。
 * 2026年分は e-Tax 公式「令和9年1月受付開始予定の帳票一覧」で確認:
 * KOA020=24.0、KOA210=12.0、KOA220=9.0。手続VRは 25.0.1 からの
 * 連番パターンで 26.0.1（XSD は RKO0010-260.xsd）。
 */
const YEAR_VERSIONS: Record<number, YearVersions> = {
  2023: { procedure: "23.1.1", koa020: "21.0", koa210: "11.0", koa220: "8.0" },
  2024: { procedure: "24.0.1", koa020: "22.0", koa210: "11.0", koa220: "8.0" },
  2025: { procedure: "25.0.1", koa020: "23.0", koa210: "11.0", koa220: "8.0" },
  2026: { procedure: "26.0.1", koa020: "24.0", koa210: "12.0", koa220: "9.0" },
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
  if (year >= 2019) return { era: 5, yy: year - 2018, mm, dd };
  if (year >= 1989) return { era: 4, yy: year - 1988, mm, dd };
  if (year >= 1927) return { era: 3, yy: year - 1925, mm, dd };
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
  const kinds: string[] = [kubun("ABA00240", 1)]; // 青色区分: 該当
  if (data.amendment) kinds.push(kubun("ABA00256", 1)); // 修正区分: 該当
  taxpayer.push(`<ABA00230>${kinds.join("")}</ABA00230>`);
  header.push(`<ABA00050>${taxpayer.join("")}</ABA00050>`);

  // --- 申告内容 ---
  const body: string[] = [];

  // 収入金額等
  const revenues: string[] = [];
  if (f.business_revenue) {
    revenues.push(`<ABB00020>${amount("ABB00030", f.business_revenue)}</ABB00020>`);
  }
  revenues.push(amount("ABB00050", f.real_estate_revenue));
  if (data.miscIncome.revenue > 0) {
    const misc: string[] = [];
    if (data.miscIncome.kubun > 0) misc.push(`<ABB00107>${data.miscIncome.kubun}</ABB00107>`);
    misc.push(amountAlways("ABB00110", data.miscIncome.revenue));
    revenues.push(`<ABB00090>${misc.join("")}</ABB00090>`);
  }
  if (revenues.length > 0) body.push(`<ABB00010>${revenues.join("")}</ABB00010>`);

  // 所得金額等
  const incomes: string[] = [];
  if (f.business_revenue || f.business_expenses) {
    incomes.push(`<ABB00280>${amountAlways("ABB00300", f._detail.business_income)}</ABB00280>`);
  }
  incomes.push(amountAlways("ABB00340", f._detail.real_estate_income));
  if (data.miscIncome.income > 0) {
    // 雑（その他）: ⑨その他 + ⑩（⑦〜⑨の計）。公的年金等・業務はないため計は⑨と同額。
    incomes.push(
      `<ABB01050><ABB01100>${amountAlways("ABB01120", data.miscIncome.income)}</ABB01100>${amountAlways("ABB01130", data.miscIncome.income)}</ABB01050>`,
    );
  }
  incomes.push(amountAlways("ABB00410", data.tax.totalIncome));
  body.push(`<ABB00270>${incomes.join("")}</ABB00270>`);

  // 所得から差し引かれる金額
  const ded: string[] = [];
  ded.push(amount("ABB00430", d.casualtyLoss));
  if (d.medical > 0) ded.push(kubunValue("ABB00435", 1) + amountAlways("ABB00440", d.medical));
  ded.push(amount("ABB00450", d.socialInsurance));
  ded.push(amount("ABB00460", d.smallBusinessMutualAid));
  ded.push(amount("ABB00470", d.lifeInsurance));
  ded.push(amount("ABB00480", d.earthquakeInsurance));
  ded.push(amount("ABB00490", d.donations));
  const widowSingle = d.widow + d.singleParent;
  if (widowSingle > 0) ded.push(kubunValue("ABB00495", 1) + amountAlways("ABB00500", widowSingle));
  ded.push(amount("ABB00510", d.workingStudent + d.disability));
  const spouseTotal = d.spouse + d.spouseSpecial;
  if (spouseTotal > 0) {
    ded.push((d.spouse > 0 ? kubunValue("ABB00515", 1) : "") + amountAlways("ABB00520", spouseTotal));
  }
  ded.push(amount("ABB00540", d.dependents + d.specialRelative));
  ded.push(amountAlways("ABB00550", d.basic));
  ded.push(amountAlways("ABB00555", d.total));
  body.push(`<ABB00420>${ded.join("")}</ABB00420>`);

  // 税金の計算
  const taxCalc: string[] = [];
  const nonForeignCredits = c.total - c.foreignTax;
  const afterCredits = Math.max(data.tax.incomeTaxBase - nonForeignCredits, 0);
  const taxTotal = afterCredits + data.tax.reconstructionTax;
  taxCalc.push(amountAlways("ABB00580", data.tax.taxableIncome));
  taxCalc.push(amountAlways("ABB00590", data.tax.incomeTaxBase));
  taxCalc.push(amount("ABB00600", c.dividend));
  taxCalc.push(amount("ABB00650", c.housingLoan));
  taxCalc.push(amount("ABB00660", c.politicalDonations + c.certifiedNpoDonations));
  taxCalc.push(amount("ABB00663", c.seismicRetrofit));
  taxCalc.push(amountAlways("ABB00670", afterCredits));
  taxCalc.push(amountAlways("ABB01010", afterCredits));
  taxCalc.push(amountAlways("ABB01020", data.tax.reconstructionTax));
  taxCalc.push(amountAlways("ABB01030", taxTotal));
  taxCalc.push(amount("ABB01040", c.foreignTax));
  taxCalc.push(amount("ABB00710", data.withholdingTax));
  // 申告納税額は100円未満切捨て（国税通則法119条）。還付になる場合は切り捨てない。
  const declaredRaw = taxTotal - c.foreignTax - data.withholdingTax;
  const declaredTax = declaredRaw > 0 ? Math.floor(declaredRaw / 100) * 100 : 0;
  taxCalc.push(amountAlways("ABB00720", declaredTax));
  taxCalc.push(amount("ABB00730", data.prepaidTax));
  // 第3期分: 納付は申告納税額−予定納税額、還付は源泉超過分も含めた過払い全額
  const thirdPeriod = declaredTax - data.prepaidTax + Math.min(declaredRaw, 0);
  if (thirdPeriod > 0) taxCalc.push(`<ABB00740>${amountAlways("ABB00750", thirdPeriod)}</ABB00740>`);
  else if (thirdPeriod < 0) taxCalc.push(`<ABB00740>${amountAlways("ABB00760", -thirdPeriod)}</ABB00740>`);
  body.push(`<ABB00570>${taxCalc.join("")}</ABB00570>`);

  // 修正申告・その他は「税金の計算」グループの外（申告内容の直下）に置く
  if (data.amendment && data.originalThirdPeriodTax !== null) {
    const increase = Math.max(thirdPeriod - data.originalThirdPeriodTax, 0);
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
// KOA210 青色申告決算書（一般用）1ページ目
// ---------------------------------------------------------------------------

/** KOA210 の固定経費欄（勘定科目名 → タグ）。 */
const KOA210_EXPENSE_LINES: [string, string][] = [
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
  const totals = data.categoryTotals.business;
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
  for (const [account, value] of extras) {
    expenseLines.push(
      `<AMF00355><AMF00060>${esc(account)}</AMF00060>${amountAlways("AMF00360", value)}</AMF00355>`,
    );
  }
  expenseLines.push(amount("AMF00370", totals["雑費"] ?? 0));
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

  return `<KOA210 VR="${vr}" id="KOA210" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA210-1 page="1">${parts.join("")}</KOA210-1></KOA210>`;
}

// ---------------------------------------------------------------------------
// KOA220 青色申告決算書（不動産所得用）1ページ目
// ---------------------------------------------------------------------------

/** KOA220 の固定経費欄（勘定科目名 → タグ）。 */
const KOA220_EXPENSE_LINES: [string, string][] = [
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
  for (const [account, value] of extras) {
    expenseLines.push(
      `<ANF00195><ANF00060>${esc(account)}</ANF00060>${amountAlways("ANF00200", value)}</ANF00195>`,
    );
  }
  expenseLines.push(amount("ANF00210", totals["雑費"] ?? 0));
  expenseLines.push(amountAlways("ANF00220", f.real_estate_expenses));
  pl.push(`<ANF00120>${expenseLines.join("")}</ANF00120>`);

  const beforeBlue = f._detail.real_estate_income_before_deduction;
  pl.push(amountAlways("ANF00230", beforeBlue));
  pl.push(amountAlways("ANF00250", beforeBlue));
  pl.push(amount("ANF00260", f._detail.blue_deduction_real_estate));
  pl.push(amountAlways("ANF00270", f._detail.real_estate_income));
  parts.push(`<ANF00000><ANF00010>${pl.join("")}</ANF00010></ANF00000>`);

  return `<KOA220 VR="${vr}" id="KOA220" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"><KOA220-1 page="1">${parts.join("")}</KOA220-1></KOA220>`;
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
      `<KOA020 VR="${versions.koa020}" id="KOA020" page="1" sakuseiDay="${esc(data.submissionDate)}" sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku">${buildKoa020Face1(normalized)}${buildKoa020Face2(normalized)}</KOA020>`,
  });
  if (data.figures.business_revenue > 0 || data.figures.business_expenses > 0) {
    forms.push({ id: "KOA210", xml: buildKoa210(normalized, versions.koa210) });
  }
  if (data.figures.real_estate_revenue > 0 || data.figures.real_estate_expenses > 0) {
    forms.push({ id: "KOA220", xml: buildKoa220(normalized, versions.koa220) });
  }

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
