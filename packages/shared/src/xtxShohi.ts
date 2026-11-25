/**
* xtxShohi.ts — 消費税申告書（一般用・本則）の e-Tax 申告等データ（XTX）生成。
*
* 手続 RSH0010（消費税及び地方消費税申告（一般・個人）、VR 26.0.0）に
* SHA010（申告書（一般用）VR 10.0）+ SHB017（付表1-3 VR 2.0）+
* SHB033（付表2-3 VR 2.0）を組み込む。手続バージョンは仕様書の
* 3桁表記（XX.X.X）で書く。仕様根拠は e-Tax 仕様書
* 項番11（XML構造設計書及び帳票フィールド仕様書）と
* 項番19（XMLスキーマ shohi）の XSD。名前空間・IT部の並び順・
* 必須要素（NOZEISHA_ID・TETSUZUKI）は所得税側（xtx.ts）と共通の
* 規則に従い、生成物は公式 XSD で検証済み。
*
* 対象は税率10%・8%（軽減）の本則課税のみ。経過措置対象課税資産の
* 譲渡等を含む期間（付表1-1/1-2・2-1/2-2）には対応しない。
* 簡易課税（SHA020）は xtxShohiKanni.ts、2割特例は本モジュールの
* buildSpecial20ConsumptionXtx が担う。生成物は署名なしの組み込み用
* データで、送信（マイナンバーカード署名）は e-Tax 側で本人が行う。
*/
import {
XtxTaxpayer,
amount,
amountAlways,
esc,
kubun,
nozeishaIdXml,
phoneXml,
ref,
yymmddXml,
zeimushoXml,
zipXml,
} from "./xtx";
import { normalizeXtxTaxpayer } from "./taxpayerNormalize";
import { transactionBusinessAmount } from "./taxcalc";
import { Transaction } from "./types";

const SOFT_NAME = "eTaxAgent";
const SHOHI_NS = "http://xml.e-tax.nta.go.jp/XSD/shohi";

/** 消費税申告（本則）の入力数値。金額はすべて円単位の実額。 */
export interface ConsumptionReturnInput {
/** 課税売上（税込）・税率10%適用分 */
salesIncl10: number;
/** 課税売上（税込）・軽減税率8%適用分 */
salesIncl8: number;
/** 非課税売上（対価の額、そのまま） */
nontaxableSales: number;
/** 免税売上（対価の額、そのまま） */
exemptSales: number;
/** 課税仕入に係る支払対価の額（税込）・税率10%適用分 */
purchasesIncl10: number;
/** 課税仕入に係る支払対価の額（税込）・軽減税率8%適用分 */
purchasesIncl8: number;
/** 中間納付税額（国税）。なければ 0 */
interimNational: number;
/** 中間納付譲渡割額（地方）。なければ 0 */
interimLocal: number;
}

/** 消費税申告の計算結果（申告書・付表への転記値）。 */
export interface ConsumptionReturn {
/** 課税売上額（税抜）・10%分 */
salesExcl10: number;
/** 課税売上額（税抜）・8%分 */
salesExcl8: number;
/** 課税売上額（税抜）合計 */
salesExcl: number;
/** 資産の譲渡等の対価の額（税抜・非課税/免税込み） */
totalSalesExcl: number;
/** 課税売上割合（%、小数第2位まで・未満切捨て） */
ratio: number;
/** 全額控除の要件（課税売上5億円以下 かつ 割合95%以上）を満たすか */
fullDeduction: boolean;
/** 課税標準額・10%分（千円未満切捨て） */
base10: number;
/** 課税標準額・8%分（千円未満切捨て） */
base8: number;
/** 課税標準額の合計 */
taxBase: number;
/** 消費税額・10%分 */
outputTax10: number;
/** 消費税額・8%分 */
outputTax8: number;
/** 消費税額の合計 */
outputTax: number;
/** 課税仕入に係る消費税額・10%分（割合適用前） */
inputTaxRaw10: number;
/** 課税仕入に係る消費税額・8%分（割合適用前） */
inputTaxRaw8: number;
/** 控除対象仕入税額・10%分（割合適用後） */
inputTax10: number;
/** 控除対象仕入税額・8%分（割合適用後） */
inputTax8: number;
/** 控除対象仕入税額の合計 */
inputTax: number;
/** 差引税額（100円未満切捨て前。マイナスは還付側） */
diffRaw: number;
/** 控除不足還付税額（国税。納付の場合は 0） */
refundNational: number;
/** 差引税額（国税・100円未満切捨て。納付の場合） */
diffNational: number;
/** 納付税額（国税） */
payableNational: number;
/** 中間納付還付税額（国税） */
interimRefundNational: number;
/** 譲渡割額の還付額（地方。納付の場合は 0） */
refundLocal: number;
/** 譲渡割額（地方・中間納付控除前、100円未満切捨て） */
localTaxGross: number;
/** 納付譲渡割額（地方・100円未満切捨て） */
payableLocal: number;
/** 中間納付還付譲渡割額（地方） */
interimRefundLocal: number;
/** 消費税及び地方消費税の合計（納付は正、還付は負） */
totalPayable: number;
}

/** 帳簿の税区分集計（消費税申告の入力金額）。金額はいずれも税込。 */
export interface ConsumptionTaxSummary {
  salesIncl10: number;
  salesIncl8: number;
  nontaxableSales: number;
  exemptSales: number;
  purchasesIncl10: number;
  purchasesIncl8: number;
  /** 税区分が未設定（"" または未知の値）の取引件数。集計に含まれない。 */
  unsetCount: number;
  /** 税区分が未設定の取引の金額合計（符号つき）。 */
  unsetAmount: number;
  /**
   * 税区分と金額の符号が合わない取引件数（例: 支出なのに課税売上の区分）。
   * 集計に含まれない。帳簿の税区分の付け間違いとして表面化させる。
   */
  excludedCount: number;
  /** 符号不一致で集計から外れた取引の金額合計（符号つき）。 */
  excludedAmount: number;
}

type ConsumptionBucket =
  | "salesIncl10"
  | "salesIncl8"
  | "nontaxableSales"
  | "exemptSales"
  | "purchasesIncl10"
  | "purchasesIncl8";

/** 税区分 → 集計バケツ。対象外は申告金額に含めないのでバケツ無し（null）。 */
const TAX_CATEGORY_BUCKETS: Record<string, ConsumptionBucket | null> = {
  "課税売上10%": "salesIncl10",
  "課税売上8%": "salesIncl8",
  非課売上: "nontaxableSales",
  免税売上: "exemptSales",
  "課対仕入10%": "purchasesIncl10",
  "課対仕入8%": "purchasesIncl8",
  対象外: null,
};

/**
 * 税区分と金額の符号が合わない取引か（例: 支出なのに課税売上の区分）。
 * 消費税の集計から外れる取引の判定で、帳簿の絞り込みでも使う。
 * 税区分が未設定・対象外の取引は不一致ではない。
 */
export function taxCategorySignMismatch(t: Pick<Transaction, "tax_category" | "amount">): boolean {
  const bucket = TAX_CATEGORY_BUCKETS[t.tax_category];
  if (bucket === undefined || bucket === null) return false;
  const amount = Math.trunc(t.amount || 0);
  if (bucket === "purchasesIncl10" || bucket === "purchasesIncl8") return amount >= 0;
  return amount <= 0;
}

/**
 * 帳簿（取引の税区分）から消費税申告の入力金額を集計する。
 * 消費税の金額は自由入力ではなく、この集計で決めるのが原則。
 * 売上バケツは収入（正の金額）だけ、仕入バケツは支出（負の金額）を
 * 正の税込額として合計する。符号が合わない取引は付け間違いとして
 * 集計から外し、件数を返して画面で警告できるようにする。
 */
export function summarizeConsumptionTax(
  transactions: Transaction[],
  year: number,
): ConsumptionTaxSummary {
  const summary: ConsumptionTaxSummary = {
    salesIncl10: 0,
    salesIncl8: 0,
    nontaxableSales: 0,
    exemptSales: 0,
    purchasesIncl10: 0,
    purchasesIncl8: 0,
    unsetCount: 0,
    unsetAmount: 0,
    excludedCount: 0,
    excludedAmount: 0,
  };
  for (const t of transactions) {
    if (t.year !== year) continue;
    const amount = Math.trunc(t.amount || 0);
    const bucket = TAX_CATEGORY_BUCKETS[t.tax_category];
    if (bucket === undefined) {
      summary.unsetCount += 1;
      summary.unsetAmount += amount;
      continue;
    }
    if (bucket === null) continue;
    if (taxCategorySignMismatch(t)) {
      summary.excludedCount += 1;
      summary.excludedAmount += amount;
      continue;
    }
    // 申告金額に算入するのは事業分のみ（家事按分後。課税仕入れは
    // 事業供用部分に限られるため。消基通11-1-5）。未設定・除外の
    // 診断金額は取引そのものの金額（総額）のまま返す。
    const businessAmount = transactionBusinessAmount(t);
    if (bucket === "purchasesIncl10" || bucket === "purchasesIncl8") {
      summary[bucket] += -businessAmount;
    } else {
      summary[bucket] += businessAmount;
    }
  }
  return summary;
}

export function floor100(x: number): number {
return Math.floor(x / 100) * 100;
}

export function floor1000(x: number): number {
return Math.floor(x / 1000) * 1000;
}

/** 税込金額 → 税抜金額（10%: ×100/110、8%: ×100/108、円未満切捨て）。 */
export function exclFromIncl(incl: number, ratePercent: number): number {
const i = Math.trunc(incl || 0);
if (i <= 0) return 0;
return Math.floor((i * 100) / (100 + ratePercent));
}

/** 税込金額 → 消費税額のうち国税分（10%: ×7.8/110、8%: ×6.24/108、円未満切捨て）。 */
export function nationalTaxFromIncl(incl: number, ratePercent: number): number {
const i = Math.trunc(incl || 0);
if (i <= 0) return 0;
return ratePercent === 10 ? Math.floor((i * 78) / 1100) : Math.floor((i * 624) / 10800);
}

/**
* 本則課税の申告数値を計算する。
* 課税売上割合が95%以上（かつ課税売上高5億円以下）なら全額控除、
* それ以外は一括比例配分方式で控除対象仕入税額を求める。
*/
export function computeConsumptionReturn(input: ConsumptionReturnInput): ConsumptionReturn {
const salesExcl10 = exclFromIncl(input.salesIncl10, 10);
const salesExcl8 = exclFromIncl(input.salesIncl8, 8);
const salesExcl = salesExcl10 + salesExcl8;
const exemptSales = Math.trunc(input.exemptSales || 0);
const totalSalesExcl =
salesExcl + Math.trunc(input.nontaxableSales || 0) + exemptSales;
// 課税売上割合の分子は課税売上＋免税売上（付表2の計算と同一）
const ratio =
totalSalesExcl > 0
? Math.floor(((salesExcl + exemptSales) / totalSalesExcl) * 10000) / 100
: 100;
const fullDeduction = salesExcl + exemptSales <= 500_000_000 && ratio >= 95;

const base10 = floor1000(salesExcl10);
const base8 = floor1000(salesExcl8);
const outputTax10 = Math.floor((base10 * 78) / 1000);
const outputTax8 = Math.floor((base8 * 624) / 10000);

// 控除対象仕入税額は国税分（10%: 7.8/110、8%: 6.24/108）で計算する
const inputTaxRaw10 = nationalTaxFromIncl(input.purchasesIncl10, 10);
const inputTaxRaw8 = nationalTaxFromIncl(input.purchasesIncl8, 8);
const applyRatio = (raw: number) =>
fullDeduction? raw: Math.floor((raw * ratio) / 100);
const inputTax10 = applyRatio(inputTaxRaw10);
const inputTax8 = applyRatio(inputTaxRaw8);

const outputTax = outputTax10 + outputTax8;
const inputTax = inputTax10 + inputTax8;
const diffRaw = outputTax - inputTax;

const interimNational = Math.trunc(input.interimNational || 0);
const interimLocal = Math.trunc(input.interimLocal || 0);

let refundNational = 0;
let diffNational = 0;
let payableNational = 0;
let interimRefundNational = 0;
let refundLocal = 0;
let localTaxGross = 0;
let payableLocal = 0;
let interimRefundLocal = 0;

if (diffRaw >= 0) {
diffNational = floor100(diffRaw);
if (diffNational >= interimNational) {
payableNational = floor100(diffNational - interimNational);
} else {
interimRefundNational = interimNational - diffNational;
}
// 地方消費税: 譲渡割額は差引税額（国税）× 22/78。中間納付の差引は
// 100円未満切捨て後の譲渡割額（localTaxGross）を基準にする
const localRaw = Math.floor((diffNational * 22) / 78);
localTaxGross = floor100(localRaw);
if (localTaxGross >= interimLocal) {
payableLocal = floor100(localTaxGross - interimLocal);
} else {
interimRefundLocal = interimLocal - localTaxGross;
}
} else {
refundNational = -diffRaw;
refundLocal = Math.floor((refundNational * 22) / 78);
// 還付側の中間納付還付額は差額そのもの（100円未満切捨てはしない）
if (interimNational > 0) interimRefundNational = interimNational;
if (interimLocal > 0) interimRefundLocal = interimLocal;
}

const totalPayable =
payableNational +
payableLocal -
refundNational -
refundLocal -
interimRefundNational -
interimRefundLocal;

return {
salesExcl10,
salesExcl8,
salesExcl,
totalSalesExcl,
ratio,
fullDeduction,
base10,
base8,
taxBase: base10 + base8,
outputTax10,
outputTax8,
outputTax,
inputTaxRaw10,
inputTaxRaw8,
inputTax10,
inputTax8,
inputTax,
diffRaw,
refundNational,
diffNational,
payableNational,
interimRefundNational,
refundLocal,
localTaxGross,
payableLocal,
interimRefundLocal,
totalPayable,
};
}

/** XTX生成の入力一式。 */
export interface ConsumptionXtxData {
taxpayer: XtxTaxpayer;
/** 課税期間の開始日 "2025-01-01" */
periodFrom: string;
/** 課税期間の終了日 "2025-12-31" */
periodTo: string;
/** 提出年月日 "2026-11-15" */
submissionDate: string;
/** 申告の種類: 1=確定、3=修正確定 */
filingKind: 1 | 3;
/** 基準期間の課税売上高（千円単位） */
basePeriodSalesThousands: number;
input: ConsumptionReturnInput;
result: ConsumptionReturn;
/** 修正申告: 既確定税額（国税）。確定申告なら null */
originalNational: number | null;
/** 修正申告: 既確定譲渡割額。確定申告なら null */
originalLocal: number | null;
}

// ---------------------------------------------------------------------------
// IT部
// ---------------------------------------------------------------------------

/** IT部の組み立てに必要な最小の入力（本則・簡易で共通）。 */
export interface ShohiItData {
taxpayer: XtxTaxpayer;
/** 課税期間の開始日 "2025-01-01" */
periodFrom: string;
/** 課税期間の終了日 "2025-12-31" */
periodTo: string;
/** 提出年月日 "2026-11-15" */
submissionDate: string;
/** 申告の種類: 1=確定、3=修正確定 */
filingKind: 1 | 3;
}

export function buildShohiIt(data: ShohiItData, procedureCd: string): string {
const t = data.taxpayer;
// ITdefinition.xsd の ITtype シーケンス順に並べる（xtx.ts の buildIt と同じ規則）。
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
if (t.shopName) items.push(`<NOZEISHA_YAGO ID="NOZEISHA_YAGO">${esc(t.shopName)}</NOZEISHA_YAGO>`);
const tel = phoneXml(t.phone);
if (tel) items.push(`<NOZEISHA_TEL ID="NOZEISHA_TEL">${tel}</NOZEISHA_TEL>`);
items.push(`<TETSUZUKI ID="TETSUZUKI"><procedure_CD>${procedureCd}</procedure_CD></TETSUZUKI>`);
const from = yymmddXml(data.periodFrom);
if (from) items.push(`<KAZEI_KIKAN_FROM ID="KAZEI_KIKAN_FROM">${from}</KAZEI_KIKAN_FROM>`);
const to = yymmddXml(data.periodTo);
if (to) items.push(`<KAZEI_KIKAN_TO ID="KAZEI_KIKAN_TO">${to}</KAZEI_KIKAN_TO>`);
items.push(
`<SHINKOKU_KBN ID="SHINKOKU_KBN"><kubun_CD>${data.filingKind}</kubun_CD></SHINKOKU_KBN>`,
);
return `<IT VR="1.0" id="IT">${items.join("")}</IT>`;
}

// ---------------------------------------------------------------------------
// SHA010 申告書（一般用）
// ---------------------------------------------------------------------------

function buildSha010(
data: ConsumptionXtxData,
options?: {
creditMethodKubun?: number;
creditSubtotal?: number;
/** 返還等対価に係る税額（2割特例など、入力に返還等がある場合） */
returnsTax?: number;
/** 貸倒れに係る税額 */
badDebtTax?: number;
/** 控除過大調整税額（貸倒回収に係る消費税額） */
badDebtRecoveryTax?: number;
},
): string {
const r = data.result;
const interimNational = Math.trunc(data.input.interimNational || 0);
const interimLocal = Math.trunc(data.input.interimLocal || 0);

// ---- 第1表 ----
const aai: string[] = [];
aai.push(ref("AAI00010", "TEISYUTSU_DAY"));
aai.push(ref("AAI00020", "ZEIMUSHO"));
aai.push(ref("AAI00030", "NOZEISHA_ADR"));
if (data.taxpayer.phone) aai.push(ref("AAI00040", "NOZEISHA_TEL"));
if (data.taxpayer.myNumber) aai.push(ref("AAI00080", "NOZEISHA_BANGO"));
const nameBlock: string[] = [];
if (data.taxpayer.nameKana) nameBlock.push(ref("AAI00100", "NOZEISHA_NM_KN"));
if (data.taxpayer.name) nameBlock.push(ref("AAI00110", "NOZEISHA_NM"));
if (nameBlock.length > 0) aai.push(`<AAI00090>${nameBlock.join("")}</AAI00090>`);
aai.push(
`<AAI00120>${ref("AAI00130", "KAZEI_KIKAN_FROM")}${ref("AAI00140", "KAZEI_KIKAN_TO")}</AAI00120>`,
);
aai.push(ref("AAI00150", "SHINKOKU_KBN"));

const aaj: string[] = [];
aaj.push(amountAlways("AAJ00010", r.taxBase));
aaj.push(amountAlways("AAJ00020", r.outputTax));
aaj.push(amount("AAJ00030", options?.badDebtRecoveryTax ?? 0));
const creditBlock: string[] = [];
creditBlock.push(amount("AAJ00050", r.inputTax));
creditBlock.push(amount("AAJ00060", options?.returnsTax ?? 0));
creditBlock.push(amount("AAJ00070", options?.badDebtTax ?? 0));
creditBlock.push(amountAlways("AAJ00080", options?.creditSubtotal ?? r.inputTax));
aaj.push(`<AAJ00040>${creditBlock.join("")}</AAJ00040>`);
aaj.push(amount("AAJ00090", r.refundNational));
aaj.push(amountAlways("AAJ00100", r.diffNational));
aaj.push(amount("AAJ00110", interimNational));
aaj.push(amount("AAJ00120", r.payableNational));
aaj.push(amount("AAJ00130", r.interimRefundNational));
if (data.filingKind === 3 && data.originalNational!== null) {
// 増加額は今回の納付税額 − 既確定税額（いずれも中間納付控除後の額）
const increase = Math.max(r.payableNational - data.originalNational, 0);
aaj.push(
`<AAJ00140>${amountAlways("AAJ00150", data.originalNational)}${amountAlways("AAJ00160", floor100(increase))}</AAJ00140>`,
);
}
aaj.push(
`<AAJ00170>${amountAlways("AAJ00180", r.salesExcl + Math.trunc(data.input.exemptSales || 0))}${amountAlways("AAJ00190", r.totalSalesExcl)}</AAJ00170>`,
);

const aak: string[] = [];
const localBase: string[] = [];
localBase.push(amount("AAK00020", r.refundNational));
localBase.push(amountAlways("AAK00030", r.diffNational));
aak.push(`<AAK00010>${localBase.join("")}</AAK00010>`);
const localTax: string[] = [];
localTax.push(amount("AAK00050", r.refundLocal));
localTax.push(amountAlways("AAK00060", r.localTaxGross));
aak.push(`<AAK00040>${localTax.join("")}</AAK00040>`);
aak.push(amount("AAK00070", interimLocal));
aak.push(amount("AAK00080", r.payableLocal));
aak.push(amount("AAK00090", r.interimRefundLocal));
if (data.filingKind === 3 && data.originalLocal!== null) {
const increaseLocal = Math.max(r.payableLocal - data.originalLocal, 0);
aak.push(
`<AAK00100>${amountAlways("AAK00110", data.originalLocal)}${amountAlways("AAK00120", floor100(increaseLocal))}</AAK00100>`,
);
}
// 合計欄は納付の場合のみ出す
aak.push(amount("AAK00130", r.payableNational + r.payableLocal));

const aam: string[] = [];
aam.push(kubun("AAM00020", options?.creditMethodKubun ?? (r.fullDeduction? 3: 2)));
aam.push(amount("AAM00030", data.basePeriodSalesThousands));

const page1 =
`<SHA010-1 page="1">` +
`<AAI00000>${aai.join("")}</AAI00000>` +
`<AAJ00000>${aaj.join("")}</AAJ00000>` +
`<AAK00000>${aak.join("")}</AAK00000>` +
`<AAM00000>${aam.join("")}</AAM00000>` +
`</SHA010-1>`;

// ---- 第2表 ----
const aan: string[] = [];
aan.push(ref("AAN00010", "NOZEISHA_ADR"));
if (data.taxpayer.phone) aan.push(ref("AAN00020", "NOZEISHA_TEL"));
const nameBlock2: string[] = [];
if (data.taxpayer.nameKana) nameBlock2.push(ref("AAN00070", "NOZEISHA_NM_KN"));
if (data.taxpayer.name) nameBlock2.push(ref("AAN00080", "NOZEISHA_NM"));
if (nameBlock2.length > 0) aan.push(`<AAN00060>${nameBlock2.join("")}</AAN00060>`);
aan.push(
`<AAN00090>${ref("AAN00100", "KAZEI_KIKAN_FROM")}${ref("AAN00110", "KAZEI_KIKAN_TO")}</AAN00090>`,
);
aan.push(ref("AAN00120", "SHINKOKU_KBN"));

const aaq: string[] = [];
// XSD の sequence 順: AAQ00040（6.24%分）→ AAQ00050（7.8%分）
aaq.push(amount("AAQ00040", r.base8));
aaq.push(amount("AAQ00050", r.base10));
aaq.push(amountAlways("AAQ00060", r.taxBase));
const aat: string[] = [];
aat.push(amount("AAT00040", r.outputTax8));
aat.push(amount("AAT00050", r.outputTax10));
// 地方消費税の課税標準となる消費税額は差引税額（第一表 AAK00030 と同じ）
const aaw: string[] = [];
aaw.push(amountAlways("AAW00010", r.diffNational));
aaw.push(amount("AAW00040", r.diffNational));

const page2 =
`<SHA010-2 page="2">` +
`<AAN00000>${aan.join("")}</AAN00000>` +
amountAlways("AAP00000", r.taxBase) +
`<AAQ00000>${aaq.join("")}</AAQ00000>` +
amountAlways("AAS00000", r.outputTax) +
`<AAT00000>${aat.join("")}</AAT00000>` +
amount("AAU00000", options?.returnsTax ?? 0) +
(options?.returnsTax
? `<AAV00000>${amount("AAV00010", options.returnsTax)}</AAV00000>`
: "") +
`<AAW00000>${aaw.join("")}</AAW00000>` +
`</SHA010-2>`;

return (
`<SHA010 VR="10.0" id="SHA010" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(data.taxpayer.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
page1 +
page2 +
`</SHA010>`
);
}

// ---------------------------------------------------------------------------
// SHB017 付表1-3
// ---------------------------------------------------------------------------

function buildShb017(data: ConsumptionXtxData): string {
const r = data.result;
const parts: string[] = [];
parts.push(
`<DSA00000><DSA00010>${ref("DSA00020", "KAZEI_KIKAN_FROM")}${ref("DSA00030", "KAZEI_KIKAN_TO")}</DSA00010>${ref("DSA00040", "NOZEISHA_NM")}</DSA00000>`,
);
parts.push(
`<DSB00000>${amount("DSB00010", r.base8)}${amount("DSB00020", r.base10)}${amountAlways("DSB00030", r.taxBase)}</DSB00000>`,
);
parts.push(
`<DSC00000><DSC00010>${amount("DSC00020", r.base8)}${amount("DSC00030", r.base10)}${amountAlways("DSC00040", r.taxBase)}</DSC00010></DSC00000>`,
);
parts.push(
`<DSD00000>${amount("DSD00010", r.outputTax8)}${amount("DSD00020", r.outputTax10)}${amountAlways("DSD00030", r.outputTax)}</DSD00000>`,
);
const dsf: string[] = [];
dsf.push(
`<DSF00010>${amount("DSF00020", r.inputTax8)}${amount("DSF00030", r.inputTax10)}${amountAlways("DSF00040", r.inputTax)}</DSF00010>`,
);
dsf.push(
`<DSF00210>${amount("DSF00220", r.inputTax8)}${amount("DSF00230", r.inputTax10)}${amountAlways("DSF00240", r.inputTax)}</DSF00210>`,
);
parts.push(`<DSF00000>${dsf.join("")}</DSF00000>`);
parts.push(amount("DSG00000", r.refundNational));
// 差引税額は100円未満切捨て後の値で第一表と一致させる
parts.push(amountAlways("DSH00000", r.diffNational));
parts.push(
`<DSI00000>${amount("DSI00010", r.refundNational)}${amountAlways("DSI00020", r.diffNational)}</DSI00000>`,
);
parts.push(
`<DSJ00000>${amount("DSJ00010", r.refundLocal)}${amountAlways("DSJ00020", r.localTaxGross)}</DSJ00000>`,
);
return (
`<SHB017 VR="2.0" id="SHB017" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(data.taxpayer.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
parts.join("") +
`</SHB017>`
);
}

// ---------------------------------------------------------------------------
// SHB033 付表2-3
// ---------------------------------------------------------------------------

function buildShb033(data: ConsumptionXtxData): string {
const r = data.result;
const parts: string[] = [];
parts.push(
`<DTA00000><DTA00010>${ref("DTA00020", "KAZEI_KIKAN_FROM")}${ref("DTA00030", "KAZEI_KIKAN_TO")}</DTA00010>${ref("DTA00040", "NOZEISHA_NM")}</DTA00000>`,
);
const dtb: string[] = [];
dtb.push(
`<DTB00010>${amount("DTB00020", r.salesExcl8)}${amount("DTB00030", r.salesExcl10)}${amountAlways("DTB00040", r.salesExcl)}</DTB00010>`,
);
dtb.push(amount("DTB00050", Math.trunc(data.input.exemptSales || 0)));
dtb.push(amountAlways("DTB00070", r.salesExcl + Math.trunc(data.input.exemptSales || 0)));
parts.push(`<DTB00000>${dtb.join("")}</DTB00000>`);
parts.push(
`<DTC00000>${amountAlways("DTC00010", r.salesExcl + Math.trunc(data.input.exemptSales || 0))}${amount("DTC00020", Math.trunc(data.input.nontaxableSales || 0))}${amountAlways("DTC00030", r.totalSalesExcl)}</DTC00000>`,
);
parts.push(`<DTD00000>${Number.isInteger(r.ratio)? String(r.ratio): r.ratio.toFixed(2)}</DTD00000>`);

const dte: string[] = [];
dte.push(
`<DTE00010>${amount("DTE00020", Math.trunc(data.input.purchasesIncl8 || 0))}${amount("DTE00030", Math.trunc(data.input.purchasesIncl10 || 0))}${amountAlways("DTE00040", Math.trunc(data.input.purchasesIncl10 || 0) + Math.trunc(data.input.purchasesIncl8 || 0))}</DTE00010>`,
);
dte.push(
`<DTE00050>${amount("DTE00060", r.inputTaxRaw8)}${amount("DTE00070", r.inputTaxRaw10)}${amountAlways("DTE00080", r.inputTaxRaw10 + r.inputTaxRaw8)}</DTE00050>`,
);
dte.push(
`<DTE00230>${amount("DTE00240", r.inputTaxRaw8)}${amount("DTE00250", r.inputTaxRaw10)}${amountAlways("DTE00260", r.inputTaxRaw10 + r.inputTaxRaw8)}</DTE00230>`,
);
parts.push(`<DTE00000>${dte.join("")}</DTE00000>`);

if (r.fullDeduction) {
parts.push(
`<DTF00000>${amount("DTF00010", r.inputTax8)}${amount("DTF00020", r.inputTax10)}${amountAlways("DTF00030", r.inputTax)}</DTF00000>`,
);
} else {
parts.push(
`<DTG00000><DTG00140>${amount("DTG00150", r.inputTax8)}${amount("DTG00160", r.inputTax10)}${amountAlways("DTG00170", r.inputTax)}</DTG00140></DTG00000>`,
);
}
parts.push(
`<DTI00000><DTI00010>${amount("DTI00020", r.inputTax8)}${amount("DTI00030", r.inputTax10)}${amountAlways("DTI00040", r.inputTax)}</DTI00010></DTI00000>`,
);
return (
`<SHB033 VR="2.0" id="SHB033" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(data.taxpayer.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
parts.join("") +
`</SHB033>`
);
}

// ---------------------------------------------------------------------------
// 全体
// ---------------------------------------------------------------------------

/**
* 消費税申告（一般用・本則）の XTX を生成する。
* 生成物は署名なしの組み込み用データで、送信は e-Tax 側で本人が行う。
*/
export function buildConsumptionXtx(data: ConsumptionXtxData): string {
// 納税者情報は正規化＋完全性検証を通してから使う。欠けていれば例外で止まり、
// 部分的なXTXは決して出ない（taxpayerNormalize が恒常対策の正本）。
const taxpayer = normalizeXtxTaxpayer(data.taxpayer, {
submissionDate: data.submissionDate,
periodFrom: data.periodFrom,
periodTo: data.periodTo,
filingKind: data.filingKind,
});
const normalized: ConsumptionXtxData = { ...data, taxpayer };
const forms: { id: string; xml: string }[] = [
{ id: "SHA010", xml: buildSha010(normalized) },
{ id: "SHB017", xml: buildShb017(normalized) },
{ id: "SHB033", xml: buildShb033(normalized) },
];
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
`<?xml version="1.0" encoding="UTF-8"?>\n` +
`<DATA id="DATA" xmlns="${SHOHI_NS}">` +
`<RSH0010 VR="26.0.0" id="RSH0010" xmlns="${SHOHI_NS}" xmlns:gen="http://xml.e-tax.nta.go.jp/XSD/general">` +
catalog +
`<CONTENTS id="CONTENTS">${buildShohiIt(normalized, "RSH0010")}${forms.map((f) => f.xml).join("")}</CONTENTS>` +
`</RSH0010></DATA>`
);
}

// ---------------------------------------------------------------------------
// 2割特例（小規模事業者に係る税額控除に関する経過措置）
// ---------------------------------------------------------------------------

/** 2割特例申告の入力数値。金額はすべて円単位。仕入税額は使わない。 */
export interface Special20ConsumptionInput {
/** 課税売上（税込）・税率10%適用分 */
salesIncl10: number;
/** 課税売上（税込）・軽減税率8%適用分 */
salesIncl8: number;
/** 非課税売上（対価の額、そのまま） */
nontaxableSales: number;
/** 免税売上（対価の額、そのまま） */
exemptSales: number;
/** 売上対価の返還等の金額（税込）・税率10%適用分 */
returnsIncl10: number;
/** 売上対価の返還等の金額（税込）・軽減税率8%適用分 */
returnsIncl8: number;
/** 貸倒回収に係る消費税額（税額そのもの）・税率10%適用分 */
badDebtRecoveryTax10: number;
/** 貸倒回収に係る消費税額（税額そのもの）・軽減税率8%適用分 */
badDebtRecoveryTax8: number;
/** 貸倒れに係る税額（税額そのもの）・税率10%適用分 */
badDebtTax10: number;
/** 貸倒れに係る税額（税額そのもの）・軽減税率8%適用分 */
badDebtTax8: number;
/** 中間納付税額（国税）。なければ 0 */
interimNational: number;
/** 中間納付譲渡割額（地方）。なければ 0 */
interimLocal: number;
}

/** 2割特例申告の計算結果（申告書・付表6への転記値）。 */
export interface Special20ConsumptionReturn {
/** 課税売上額（税抜）・10%分 */
salesExcl10: number;
/** 課税売上額（税抜）・8%分 */
salesExcl8: number;
/** 課税売上額（税抜）合計 */
salesExcl: number;
/** 資産の譲渡等の対価の額（税抜・非課税/免税込み） */
totalSalesExcl: number;
/** 課税標準額・10%分（千円未満切捨て） */
base10: number;
/** 課税標準額・8%分（千円未満切捨て） */
base8: number;
/** 課税標準額の合計 */
taxBase: number;
/** 消費税額・10%分 */
outputTax10: number;
/** 消費税額・8%分 */
outputTax8: number;
/** 消費税額の合計 */
outputTax: number;
/** 返還等対価に係る税額・10%分 */
returnsTax10: number;
/** 返還等対価に係る税額・8%分 */
returnsTax8: number;
/** 返還等対価に係る税額の合計 */
returnsTax: number;
/** 貸倒回収に係る消費税額の合計 */
badDebtRecoveryTax: number;
/** 貸倒れに係る税額の合計 */
badDebtTax: number;
/** 特別控除税額の基礎となる消費税額・10%分（付表6 ⑥） */
basis10: number;
/** 特別控除税額の基礎となる消費税額・8%分（付表6 ⑥） */
basis8: number;
/** 特別控除税額（控除対象仕入税額）・10%分 = 基礎 × 80% */
specialCredit10: number;
/** 特別控除税額（控除対象仕入税額）・8%分 */
specialCredit8: number;
/** 特別控除税額（控除対象仕入税額）の合計 */
specialCredit: number;
/** 控除税額小計（特別控除＋返還等＋貸倒れ） */
creditSubtotal: number;
/** 控除不足還付税額（国税。納付の場合は 0） */
refundNational: number;
/** 差引税額（国税・100円未満切捨て。納付の場合） */
diffNational: number;
/** 納付税額（国税） */
payableNational: number;
/** 中間納付還付税額（国税） */
interimRefundNational: number;
/** 譲渡割額の還付額（地方。納付の場合は 0） */
refundLocal: number;
/** 譲渡割額（地方・中間納付控除前、100円未満切捨て） */
localTaxGross: number;
/** 納付譲渡割額（地方・100円未満切捨て） */
payableLocal: number;
/** 中間納付還付譲渡割額（地方） */
interimRefundLocal: number;
/** 消費税及び地方消費税の合計（納付は正、還付は負） */
totalPayable: number;
}

/**
* 2割特例の申告数値を計算する。控除対象仕入税額は、売上税額
* （貸倒回収を加え返還等を引いた基礎税額）の 80%（付表6の手順）。
*/
export function computeSpecial20ConsumptionReturn(
input: Special20ConsumptionInput,
): Special20ConsumptionReturn {
const salesExcl10 = exclFromIncl(input.salesIncl10, 10);
const salesExcl8 = exclFromIncl(input.salesIncl8, 8);
const salesExcl = salesExcl10 + salesExcl8;
const totalSalesExcl =
salesExcl + Math.trunc(input.nontaxableSales || 0) + Math.trunc(input.exemptSales || 0);
const base10 = floor1000(salesExcl10);
const base8 = floor1000(salesExcl8);
const outputTax10 = Math.floor((base10 * 78) / 1000);
const outputTax8 = Math.floor((base8 * 624) / 10000);
const outputTax = outputTax10 + outputTax8;

const returnsTax10 = nationalTaxFromIncl(input.returnsIncl10, 10);
const returnsTax8 = nationalTaxFromIncl(input.returnsIncl8, 8);
const returnsTax = returnsTax10 + returnsTax8;
const badDebtRecoveryTax10 = Math.trunc(input.badDebtRecoveryTax10 || 0);
const badDebtRecoveryTax8 = Math.trunc(input.badDebtRecoveryTax8 || 0);
const badDebtRecoveryTax = badDebtRecoveryTax10 + badDebtRecoveryTax8;
const badDebtTax10 = Math.trunc(input.badDebtTax10 || 0);
const badDebtTax8 = Math.trunc(input.badDebtTax8 || 0);
const badDebtTax = badDebtTax10 + badDebtTax8;

const basis10 = Math.max(outputTax10 + badDebtRecoveryTax10 - returnsTax10, 0);
const basis8 = Math.max(outputTax8 + badDebtRecoveryTax8 - returnsTax8, 0);
const specialCredit10 = Math.floor((basis10 * 80) / 100);
const specialCredit8 = Math.floor((basis8 * 80) / 100);
const specialCredit = specialCredit10 + specialCredit8;
const creditSubtotal = specialCredit + returnsTax + badDebtTax;

const diffRaw = outputTax + badDebtRecoveryTax - creditSubtotal;
const interimNational = Math.trunc(input.interimNational || 0);
const interimLocal = Math.trunc(input.interimLocal || 0);

let refundNational = 0;
let diffNational = 0;
let payableNational = 0;
let interimRefundNational = 0;
let refundLocal = 0;
let localTaxGross = 0;
let payableLocal = 0;
let interimRefundLocal = 0;

if (diffRaw >= 0) {
diffNational = floor100(diffRaw);
if (diffNational >= interimNational) {
payableNational = floor100(diffNational - interimNational);
} else {
interimRefundNational = interimNational - diffNational;
}
// 地方消費税: 中間納付の差引は切捨て後の譲渡割額（localTaxGross）基準
const localRaw = Math.floor((diffNational * 22) / 78);
localTaxGross = floor100(localRaw);
if (localTaxGross >= interimLocal) {
payableLocal = floor100(localTaxGross - interimLocal);
} else {
interimRefundLocal = interimLocal - localTaxGross;
}
} else {
refundNational = -diffRaw;
refundLocal = Math.floor((refundNational * 22) / 78);
// 還付側の中間納付還付額は差額そのもの（100円未満切捨てはしない）
if (interimNational > 0) interimRefundNational = interimNational;
if (interimLocal > 0) interimRefundLocal = interimLocal;
}

const totalPayable =
payableNational +
payableLocal -
refundNational -
refundLocal -
interimRefundNational -
interimRefundLocal;

return {
salesExcl10,
salesExcl8,
salesExcl,
totalSalesExcl,
base10,
base8,
taxBase: base10 + base8,
outputTax10,
outputTax8,
outputTax,
returnsTax10,
returnsTax8,
returnsTax,
badDebtRecoveryTax,
badDebtTax,
basis10,
basis8,
specialCredit10,
specialCredit8,
specialCredit,
creditSubtotal,
refundNational,
diffNational,
payableNational,
interimRefundNational,
refundLocal,
localTaxGross,
payableLocal,
interimRefundLocal,
totalPayable,
};
}

/** XTX生成の入力一式（2割特例）。 */
export interface Special20ConsumptionXtxData {
taxpayer: XtxTaxpayer;
/** 課税期間の開始日 "2025-01-01" */
periodFrom: string;
/** 課税期間の終了日 "2025-12-31" */
periodTo: string;
/** 提出年月日 "2026-11-15" */
submissionDate: string;
/** 申告の種類: 1=確定、3=修正確定 */
filingKind: 1 | 3;
/** 基準期間の課税売上高（千円単位） */
basePeriodSalesThousands: number;
input: Special20ConsumptionInput;
result: Special20ConsumptionReturn;
/** 修正申告: 既確定税額（国税）。確定申告なら null */
originalNational: number | null;
/** 修正申告: 既確定譲渡割額。確定申告なら null */
originalLocal: number | null;
}

// ---------------------------------------------------------------------------
// SHB070 付表6（税率別消費税額計算表・2割特例用）
// ---------------------------------------------------------------------------

function buildShb070(data: Special20ConsumptionXtxData): string {
const r = data.result;
const badDebtRecovery10 = Math.trunc(data.input.badDebtRecoveryTax10 || 0);
const badDebtRecovery8 = Math.trunc(data.input.badDebtRecoveryTax8 || 0);
const badDebtTax10 = Math.trunc(data.input.badDebtTax10 || 0);
const badDebtTax8 = Math.trunc(data.input.badDebtTax8 || 0);
const parts: string[] = [];
parts.push(
`<AYA00000><AYA00010>${ref("AYA00020", "KAZEI_KIKAN_FROM")}${ref("AYA00030", "KAZEI_KIKAN_TO")}</AYA00010>${ref("AYA00040", "NOZEISHA_NM")}</AYA00000>`,
);
parts.push(
`<AYB00000>` +
`<AYB00010>${amount("AYB00020", r.salesExcl8)}${amount("AYB00030", r.salesExcl10)}${amountAlways("AYB00040", r.salesExcl)}</AYB00010>` +
`<AYB00050>${amount("AYB00060", r.base8)}${amount("AYB00070", r.base10)}${amountAlways("AYB00080", r.taxBase)}</AYB00050>` +
`<AYB00090>${amount("AYB00100", r.outputTax8)}${amount("AYB00110", r.outputTax10)}${amountAlways("AYB00120", r.outputTax)}</AYB00090>` +
`<AYB00130>${amount("AYB00140", badDebtRecovery8)}${amount("AYB00150", badDebtRecovery10)}${amount("AYB00160", r.badDebtRecoveryTax)}</AYB00130>` +
`<AYB00170>${amount("AYB00180", r.returnsTax8)}${amount("AYB00190", r.returnsTax10)}${amount("AYB00200", r.returnsTax)}</AYB00170>` +
`<AYB00210>${amount("AYB00220", r.basis8)}${amount("AYB00230", r.basis10)}${amountAlways("AYB00240", r.basis8 + r.basis10)}</AYB00210>` +
`</AYB00000>`,
);
parts.push(
`<AYC00000><AYC00010>${amount("AYC00020", r.specialCredit8)}${amount("AYC00030", r.specialCredit10)}${amountAlways("AYC00040", r.specialCredit)}</AYC00010></AYC00000>`,
);
parts.push(
`<AYD00000><AYD00010>${amount("AYD00020", badDebtTax8)}${amount("AYD00030", badDebtTax10)}${amount("AYD00040", r.badDebtTax)}</AYD00010></AYD00000>`,
);
return (
`<SHB070 VR="1.0" id="SHB070" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(data.taxpayer.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
parts.join("") +
`</SHB070>`
);
}

/**
* 消費税申告（2割特例）の XTX を生成する。手続は本則と同じ RSH0010 で、
* 申告書 SHA010 の控除税額の計算方法（AAM00020）に 8（2割特例）を立て、
* 付表1-3/2-3 の代わりに付表6（SHB070）を組み込む。
* 生成物は署名なしの組み込み用データで、送信は e-Tax 側で本人が行う。
*/
export function buildSpecial20ConsumptionXtx(data: Special20ConsumptionXtxData): string {
// 2割特例の適用期間は令和5年10月1日から令和8年9月30日までの課税期間
if (data.periodTo < "2023-10-01" || data.periodFrom > "2026-09-30") {
throw new Error(
"2割特例は課税期間が2023年10月1日から2026年9月30日までの期間と重なる場合に適用できます",
);
}
const taxpayer = normalizeXtxTaxpayer(data.taxpayer, {
submissionDate: data.submissionDate,
periodFrom: data.periodFrom,
periodTo: data.periodTo,
filingKind: data.filingKind,
});
const r = data.result;
// SHA010 の生成は本則と共用する。控除対象仕入税額には特別控除税額を渡す。
const shaData: ConsumptionXtxData = {
taxpayer,
periodFrom: data.periodFrom,
periodTo: data.periodTo,
submissionDate: data.submissionDate,
filingKind: data.filingKind,
basePeriodSalesThousands: data.basePeriodSalesThousands,
input: {
salesIncl10: data.input.salesIncl10,
salesIncl8: data.input.salesIncl8,
nontaxableSales: data.input.nontaxableSales,
exemptSales: data.input.exemptSales,
purchasesIncl10: 0,
purchasesIncl8: 0,
interimNational: data.input.interimNational,
interimLocal: data.input.interimLocal,
},
result: {
salesExcl10: r.salesExcl10,
salesExcl8: r.salesExcl8,
salesExcl: r.salesExcl,
totalSalesExcl: r.totalSalesExcl,
ratio: 100,
fullDeduction: false,
base10: r.base10,
base8: r.base8,
taxBase: r.taxBase,
outputTax10: r.outputTax10,
outputTax8: r.outputTax8,
outputTax: r.outputTax,
inputTaxRaw10: 0,
inputTaxRaw8: 0,
inputTax10: r.specialCredit10,
inputTax8: r.specialCredit8,
inputTax: r.specialCredit,
diffRaw: r.outputTax + r.badDebtRecoveryTax - r.creditSubtotal,
refundNational: r.refundNational,
diffNational: r.diffNational,
payableNational: r.payableNational,
interimRefundNational: r.interimRefundNational,
refundLocal: r.refundLocal,
localTaxGross: r.localTaxGross,
payableLocal: r.payableLocal,
interimRefundLocal: r.interimRefundLocal,
totalPayable: r.totalPayable,
},
originalNational: data.originalNational,
originalLocal: data.originalLocal,
};
const normalized: Special20ConsumptionXtxData = { ...data, taxpayer };
const forms: { id: string; xml: string }[] = [
{
id: "SHA010",
xml: buildSha010(shaData, {
creditMethodKubun: 8,
creditSubtotal: r.creditSubtotal,
returnsTax: r.returnsTax,
badDebtTax: r.badDebtTax,
badDebtRecoveryTax: r.badDebtRecoveryTax,
}),
},
{ id: "SHB070", xml: buildShb070(normalized) },
];
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
`<?xml version="1.0" encoding="UTF-8"?>\n` +
`<DATA id="DATA" xmlns="${SHOHI_NS}">` +
`<RSH0010 VR="26.0.0" id="RSH0010" xmlns="${SHOHI_NS}" xmlns:gen="http://xml.e-tax.nta.go.jp/XSD/general">` +
catalog +
`<CONTENTS id="CONTENTS">${buildShohiIt(shaData, "RSH0010")}${forms.map((f) => f.xml).join("")}</CONTENTS>` +
`</RSH0010></DATA>`
);
}
