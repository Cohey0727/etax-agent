/**
* xtxShohiKanni.ts — 消費税申告書（簡易課税用・個人）の e-Tax 申告等データ生成。
*
* 手続 RSH0030（消費税及び地方消費税申告（簡易課税・個人）、VR 26.0.0）に
* SHA020（申告書（簡易課税用）VR 9.0）+ SHB047（付表4-3 VR 1.0）+
* SHB067（付表5-3 VR 1.0）を組み込む。様式の組・項目タグ・並び順は
* e-Tax 仕様書 項番11（帳票フィールド仕様書）と項番19
* （XMLスキーマ shohi）の XSD に従い、生成物は公式 XSD で検証する
* （xtxXsd.test.ts）。
*
* 計算方式:
* - 事業が1種類だけなら専業者計算（基礎税額 × みなし仕入率）。
* - 2種類以上は原則計算（事業区分別の売上税額 × みなし仕入率を合計し、
* 基礎税額との比率で按分する。国税庁の設例の手順どおり）。
* - 75%特例（消令57条3項）: 1事業で75%以上ならその事業の率を全体に
* 適用（同項1号）、2事業の合計で75%以上なら高い方の率はそのまま、
* 残り全部に低い方の率を適用（同項2号）。原則・特例は選択適用で、
* 控除対象仕入税額が最大になる方式を選ぶ（税率区分ごとに異なる
* 方式は選べないため、10%分と8%分の合計で比較する）。
* - 売上対価の返還等は税込額から割戻しで税額化し、基礎税額と付表4-3で
* 控除する。帳簿側で返還等を売上から直接減額している場合は入力不要。
*
* 生成物は署名なしの組み込み用データで、送信は e-Tax 側で本人が行う。
*/
import { SIMPLIFIED_RATES, BusinessKind} from "./taxcalc";
import { normalizeXtxTaxpayer} from "./taxpayerNormalize";
import { XtxTaxpayer, amount, amountAlways, esc, kubun, ref} from "./xtx";
import {
amendmentIncrease,
buildShohiIt,
consumptionAdjustmentTaxes,
exclFromIncl,
nationalTaxFromIncl,
outputTaxesFromExcl,
settleConsumptionTax,
signedLocalTax,
signedNationalTax,
} from "./xtxShohi";

const SOFT_NAME = "eTaxAgent";
const SHOHI_NS = "http://xml.e-tax.nta.go.jp/XSD/shohi";

/** 簡易課税の事業区分（1=卸売、2=小売、3=製造等、4=その他、5=サービス等、6=不動産）。 */
export type SimplifiedCategory = 1 | 2 | 3 | 4 | 5 | 6;

const CATEGORY_KINDS: Record<SimplifiedCategory, BusinessKind> = {
1: "wholesale",
2: "retail",
3: "manufacturing",
4: "other",
5: "services",
6: "real_estate",
};

const CATEGORIES: SimplifiedCategory[] = [1, 2, 3, 4, 5, 6];

/** 事業区分のみなし仕入率（0.9 / 0.8 / 0.7 / 0.6 / 0.5 / 0.4）。 */
export function deemedRate(category: SimplifiedCategory): number {
return SIMPLIFIED_RATES[CATEGORY_KINDS[category]];
}

/** 事業区分ごとの課税売上（税込）。 */
export interface SimplifiedCategorySales {
/** 税率10%適用分（税込） */
incl10: number;
/** 軽減税率8%適用分（税込） */
incl8: number;
}

/** 簡易課税申告の入力数値。金額はすべて円単位。 */
export interface SimplifiedConsumptionInput {
/** 事業区分ごとの課税売上（税込）。売上のない区分は省略可 */
salesByCategory: Partial<Record<SimplifiedCategory, SimplifiedCategorySales>>;
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

/** 事業区分ごとの計算結果（付表5-3の明細・申告書の参考事項への転記値）。 */
export interface SimplifiedCategoryResult {
category: SimplifiedCategory;
/** みなし仕入率 */
deemedRate: number;
/** 課税売上高（税抜）・軽減税率8%適用分 */
excl8: number;
/** 課税売上高（税抜）・税率10%適用分 */
excl10: number;
/** 課税売上高（税抜）合計 */
exclTotal: number;
/** 課税売上高に係る消費税額（国税分）・軽減税率8%適用分 */
tax8: number;
/** 課税売上高に係る消費税額（国税分）・税率10%適用分 */
tax10: number;
/** 課税売上高に係る消費税額（国税分）合計 */
taxTotal: number;
/** 売上割合（%、小数第1位まで・未満切捨て） */
sharePercent: number;
}

/** 控除対象仕入税額の計算方式（消令57条2項・3項）。 */
export type SimplifiedAppliedRule =
| { kind: "single" }
| { kind: "principle" }
| { kind: "special1"; category: SimplifiedCategory }
| { kind: "special2"; higher: SimplifiedCategory; lower: SimplifiedCategory };

/** 特例（75%）の選択肢1件分の計算結果（付表5-3 ロへの転記値）。 */
export interface SimplifiedSpecialOption {
rule: "special1" | "special2";
/** special1: 75%以上を占める事業区分 */
category?: SimplifiedCategory;
/** special2: ペアのうち率が高い方の事業区分 */
higher?: SimplifiedCategory;
/** special2: ペアのうち率が低い方の事業区分 */
lower?: SimplifiedCategory;
/** この方式での控除対象仕入税額・軽減税率8%適用分 */
inputTax8: number;
/** この方式での控除対象仕入税額・税率10%適用分 */
inputTax10: number;
}

/** 簡易課税申告の計算結果（申告書・付表への転記値）。 */
export interface SimplifiedConsumptionReturn {
categories: SimplifiedCategoryResult[];
/** 売上のあった事業区分が1つだけならその区分、複数なら null */
singleCategory: SimplifiedCategory | null;
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
/** 控除対象仕入税額の計算の基礎となる消費税額・10%分（付表5-3 ④） */
basis10: number;
/** 控除対象仕入税額の計算の基礎となる消費税額・8%分（付表5-3 ④） */
basis8: number;
/** 原則計算の按分前金額・10%分（付表5-3 DVE00030 の按分前の内訳。専業者の場合は 0） */
principleRaw10: number;
/** 原則計算の按分前金額・8%分（付表5-3 DVE00020 の按分前の内訳。専業者の場合は 0） */
principleRaw8: number;
/** 原則計算での控除対象仕入税額・10%分（付表5-3 イ） */
principleInputTax10: number;
/** 原則計算での控除対象仕入税額・8%分（付表5-3 イ） */
principleInputTax8: number;
/** 適用できる75%特例の選択肢（該当がなければ空） */
specialOptions: SimplifiedSpecialOption[];
/** 実際に適用した計算方式（控除対象仕入税額が最大のもの） */
appliedRule: SimplifiedAppliedRule;
/** 控除対象仕入税額・10%分 */
inputTax10: number;
/** 控除対象仕入税額・8%分 */
inputTax8: number;
/** 控除対象仕入税額の合計 */
inputTax: number;
/** 控除税額小計・10%分（仕入税額＋返還等＋貸倒れ） */
creditSubtotal10: number;
/** 控除税額小計・8%分 */
creditSubtotal8: number;
/** 控除税額小計の合計 */
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

/** 割合（%）を小数第1位まで（未満切捨て）に丸める。 */
function percent1(numerator: number, denominator: number): number {
if (denominator <= 0) return 0;
return Math.floor((numerator * 1000) / denominator) / 10;
}

/** みなし仕入率の乗算（率は 0.4〜0.9 の10%刻み。整数演算で切り捨てる）。 */
function floorDeemed(base: number, rate: number): number {
return Math.floor((base * Math.round(rate * 10)) / 10);
}

/**
* 簡易課税の申告数値を計算する。
* 控除対象仕入税額は、専業者なら基礎税額 × みなし仕入率、複数事業なら
* 原則計算（区分別の売上税額 × みなし仕入率の合計を、基礎税額 ÷ 区分別
* 売上税額合計 の比率で按分。国税庁の設例の手順）で求める。
*/
export function computeSimplifiedConsumptionReturn(
input: SimplifiedConsumptionInput,
): SimplifiedConsumptionReturn {
const categories: SimplifiedCategoryResult[] = CATEGORIES.map((category) => {
const sales = input.salesByCategory[category]?? { incl10: 0, incl8: 0};
const excl10 = exclFromIncl(sales.incl10, 10);
const excl8 = exclFromIncl(sales.incl8, 8);
const tax10 = nationalTaxFromIncl(sales.incl10, 10);
const tax8 = nationalTaxFromIncl(sales.incl8, 8);
return {
category,
deemedRate: deemedRate(category),
excl8,
excl10,
exclTotal: excl10 + excl8,
tax8,
tax10,
taxTotal: tax10 + tax8,
sharePercent: 0,
};
}).filter((c) => c.exclTotal > 0 || c.taxTotal > 0);

const salesExcl10 = categories.reduce((s, c) => s + c.excl10, 0);
const salesExcl8 = categories.reduce((s, c) => s + c.excl8, 0);
const salesExcl = salesExcl10 + salesExcl8;
for (const c of categories) c.sharePercent = percent1(c.exclTotal, salesExcl);
const totalSalesExcl =
salesExcl + Math.trunc(input.nontaxableSales || 0) + Math.trunc(input.exemptSales || 0);

const outputTaxes = outputTaxesFromExcl(salesExcl10, salesExcl8);
const { outputTax10, outputTax8, outputTax } = outputTaxes;
const {
returnsTax10,
returnsTax8,
returnsTax,
badDebtRecoveryTax10,
badDebtRecoveryTax8,
badDebtRecoveryTax,
badDebtTax10,
badDebtTax8,
badDebtTax,
} = consumptionAdjustmentTaxes(input);

const basis10 = Math.max(outputTax10 + badDebtRecoveryTax10 - returnsTax10, 0);
const basis8 = Math.max(outputTax8 + badDebtRecoveryTax8 - returnsTax8, 0);

const singleCategory = categories.length === 1? categories[0].category: null;
const taxTotal10 = categories.reduce((s, c) => s + c.tax10, 0);
const taxTotal8 = categories.reduce((s, c) => s + c.tax8, 0);
let principleRaw10 = 0;
let principleRaw8 = 0;
let principleInputTax10 = 0;
let principleInputTax8 = 0;
let inputTax10 = 0;
let inputTax8 = 0;
const specialOptions: SimplifiedSpecialOption[] = [];
let appliedRule: SimplifiedAppliedRule = { kind: "principle" };
if (singleCategory!== null) {
const rate = deemedRate(singleCategory);
inputTax10 = floorDeemed(basis10, rate);
inputTax8 = floorDeemed(basis8, rate);
appliedRule = { kind: "single" };
} else if (categories.length > 1) {
principleRaw10 = categories.reduce(
(s, c) => s + floorDeemed(c.tax10, c.deemedRate),
0,
);
principleRaw8 = categories.reduce((s, c) => s + floorDeemed(c.tax8, c.deemedRate), 0);
principleInputTax10 = taxTotal10 > 0? Math.floor((basis10 * principleRaw10) / taxTotal10): 0;
principleInputTax8 = taxTotal8 > 0? Math.floor((basis8 * principleRaw8) / taxTotal8): 0;
inputTax10 = principleInputTax10;
inputTax8 = principleInputTax8;

// 75%特例（消令57条3項）。判定割合は課税売上高（税抜）の割合で、
// 返還等は区分別に分かれていないため控除前の売上高で判定する。
// 方式の選択は税率区分ごとに分けられないため、合計額で比較する。
const shareAtLeast75 = (excl: number): boolean => salesExcl > 0 && excl * 4 >= salesExcl * 3;
for (const c of categories) {
if (!shareAtLeast75(c.exclTotal)) continue;
// 特例1号: その事業のみなし仕入率を全体の基礎税額に適用する
specialOptions.push({
rule: "special1",
category: c.category,
inputTax8: floorDeemed(basis8, c.deemedRate),
inputTax10: floorDeemed(basis10, c.deemedRate),
});
}
for (let i = 0; i < categories.length; i++) {
for (let j = i + 1; j < categories.length; j++) {
const higher = categories[i];
const lower = categories[j];
if (!shareAtLeast75(higher.exclTotal + lower.exclTotal)) continue;
// 特例2号: 高い方の事業はその率、残り全部（第3の事業を含む）に
// 低い方の率を適用し、原則計算と同じ按分式で求める
const raw10 =
floorDeemed(higher.tax10, higher.deemedRate) +
floorDeemed(taxTotal10 - higher.tax10, lower.deemedRate);
const raw8 =
floorDeemed(higher.tax8, higher.deemedRate) +
floorDeemed(taxTotal8 - higher.tax8, lower.deemedRate);
specialOptions.push({
rule: "special2",
higher: higher.category,
lower: lower.category,
inputTax8: taxTotal8 > 0? Math.floor((basis8 * raw8) / taxTotal8): 0,
inputTax10: taxTotal10 > 0? Math.floor((basis10 * raw10) / taxTotal10): 0,
});
}
}
// 原則・特例のうち控除対象仕入税額が最大の方式を選ぶ（同額なら原則）
for (const option of specialOptions) {
if (option.inputTax8 + option.inputTax10 > inputTax8 + inputTax10) {
inputTax8 = option.inputTax8;
inputTax10 = option.inputTax10;
appliedRule =
option.rule === "special1"
? { kind: "special1", category: option.category as SimplifiedCategory }
: {
kind: "special2",
higher: option.higher as SimplifiedCategory,
lower: option.lower as SimplifiedCategory,
};
}
}
}
const inputTax = inputTax10 + inputTax8;

const creditSubtotal10 = inputTax10 + returnsTax10 + badDebtTax10;
const creditSubtotal8 = inputTax8 + returnsTax8 + badDebtTax8;
const creditSubtotal = creditSubtotal10 + creditSubtotal8;

const diffRaw = outputTax + badDebtRecoveryTax - creditSubtotal;

return {
categories,
singleCategory,
salesExcl10,
salesExcl8,
salesExcl,
totalSalesExcl,
...outputTaxes,
returnsTax10,
returnsTax8,
returnsTax,
badDebtRecoveryTax,
badDebtTax,
basis10,
basis8,
principleRaw10,
principleRaw8,
principleInputTax10,
principleInputTax8,
specialOptions,
appliedRule,
inputTax10,
inputTax8,
inputTax,
creditSubtotal10,
creditSubtotal8,
creditSubtotal,
...settleConsumptionTax(diffRaw, input.interimNational, input.interimLocal),
};
}

/** XTX生成の入力一式（簡易課税）。 */
export interface SimplifiedConsumptionXtxData {
taxpayer: XtxTaxpayer;
/** 課税期間の開始日 "2027-01-01" */
periodFrom: string;
/** 課税期間の終了日 "2027-12-31" */
periodTo: string;
/** 提出年月日 "2028-02-15" */
submissionDate: string;
/** 申告の種類: 1=確定、3=修正確定 */
filingKind: 1 | 3;
/** 基準期間の課税売上高（円単位・税抜） */
basePeriodSales: number;
input: SimplifiedConsumptionInput;
result: SimplifiedConsumptionReturn;
/** 修正申告: 既確定税額（国税）。確定申告なら null */
originalNational: number | null;
/** 修正申告: 既確定譲渡割額。確定申告なら null */
originalLocal: number | null;
}

/** 割合要素（小数第1位まで）。0なら出力しない。 */
function percent(tag: string, value: number): string {
if (!value) return "";
return `<${tag}>${value.toFixed(1)}</${tag}>`;
}

// ---------------------------------------------------------------------------
// SHA020 申告書（簡易課税用）
// ---------------------------------------------------------------------------

function buildSha020(data: SimplifiedConsumptionXtxData): string {
const r = data.result;
const t = data.taxpayer;
const interimNational = Math.trunc(data.input.interimNational || 0);
const interimLocal = Math.trunc(data.input.interimLocal || 0);

// ---- 第1表 ----
const abh: string[] = [];
abh.push(ref("ABH00010", "TEISYUTSU_DAY"));
abh.push(ref("ABH00020", "ZEIMUSHO"));
abh.push(ref("ABH00030", "NOZEISHA_ADR"));
if (t.phone) abh.push(ref("ABH00040", "NOZEISHA_TEL"));
const shopBlock: string[] = [];
if (t.nameKana) shopBlock.push(ref("ABH00060", "NOZEISHA_NM_KN"));
if (t.name) shopBlock.push(ref("ABH00070", "NOZEISHA_NM"));
if (shopBlock.length > 0) abh.push(`<ABH00050>${shopBlock.join("")}</ABH00050>`);
if (t.myNumber) abh.push(ref("ABH00080", "NOZEISHA_BANGO"));
abh.push(
`<ABH00120>${ref("ABH00130", "KAZEI_KIKAN_FROM")}${ref("ABH00140", "KAZEI_KIKAN_TO")}</ABH00120>`,
);
abh.push(ref("ABH00150", "SHINKOKU_KBN"));

const abi: string[] = [];
abi.push(amountAlways("ABI00010", r.taxBase));
abi.push(amountAlways("ABI00020", r.outputTax));
abi.push(amount("ABI00030", r.badDebtRecoveryTax));
const creditBlock: string[] = [];
creditBlock.push(amount("ABI00050", r.inputTax));
creditBlock.push(amount("ABI00060", r.returnsTax));
creditBlock.push(amount("ABI00070", r.badDebtTax));
creditBlock.push(amountAlways("ABI00080", r.creditSubtotal));
abi.push(`<ABI00040>${creditBlock.join("")}</ABI00040>`);
abi.push(amount("ABI00090", r.refundNational));
abi.push(amountAlways("ABI00100", r.diffNational));
abi.push(amount("ABI00110", interimNational));
abi.push(amount("ABI00120", r.payableNational));
abi.push(amount("ABI00130", r.interimRefundNational));
let amendmentNational = 0;
if (data.filingKind === 3 && data.originalNational!== null) {
amendmentNational = amendmentIncrease(signedNationalTax(r), data.originalNational);
abi.push(
`<ABI00140>${amountAlways("ABI00150", data.originalNational)}${amountAlways("ABI00160", amendmentNational)}</ABI00140>`,
);
}
// この課税期間の課税売上高は、課税売上（税抜）に輸出などの免税売上を加えた額
abi.push(amount("ABI00170", r.salesExcl + Math.trunc(data.input.exemptSales || 0)));
abi.push(amount("ABI00180", Math.trunc(data.basePeriodSales || 0)));

const abj: string[] = [];
abj.push(
`<ABJ00010>${amount("ABJ00020", r.refundNational)}${amountAlways("ABJ00030", r.diffNational)}</ABJ00010>`,
);
abj.push(
`<ABJ00040>${amount("ABJ00050", r.refundLocal)}${amountAlways("ABJ00060", r.localTaxGross)}</ABJ00040>`,
);
abj.push(amount("ABJ00070", interimLocal));
abj.push(amount("ABJ00080", r.payableLocal));
abj.push(amount("ABJ00090", r.interimRefundLocal));
let amendmentLocal = 0;
if (data.filingKind === 3 && data.originalLocal!== null) {
amendmentLocal = amendmentIncrease(signedLocalTax(r), data.originalLocal);
abj.push(
`<ABJ00100>${amountAlways("ABJ00110", data.originalLocal)}${amountAlways("ABJ00120", amendmentLocal)}</ABJ00100>`,
);
}
abj.push(
amountAlways(
"ABJ00130",
data.filingKind === 3? amendmentNational + amendmentLocal: r.totalPayable,
),
);

const abl: string[] = [];
abl.push(kubun("ABL00010", 2)); // 売上税額の積上げ計算は使わない（割戻し計算）
const categoryBlocks: string[] = [];
const ablTags: Record<number, [string, string, string]> = {
1: ["ABL00030", "ABL00040", "ABL00050"],
2: ["ABL00060", "ABL00070", "ABL00080"],
3: ["ABL00090", "ABL00100", "ABL00110"],
4: ["ABL00120", "ABL00130", "ABL00140"],
5: ["ABL00150", "ABL00160", "ABL00170"],
6: ["ABL00180", "ABL00190", "ABL00200"],
};
for (const c of r.categories) {
const [group, salesTag, shareTag] = ablTags[c.category];
categoryBlocks.push(
`<${group}>${amount(salesTag, Math.floor(c.exclTotal / 1000))}${percent(shareTag, c.sharePercent)}</${group}>`,
);
}
if (categoryBlocks.length > 0) {
abl.push(`<ABL00020>${categoryBlocks.join("")}</ABL00020>`);
}
abl.push(
kubun("ABL00210", r.appliedRule.kind === "special1" || r.appliedRule.kind === "special2"? 1: 2),
); // 特例計算適用（令57条3項）: 1=有、2=無。売上割合は実績値を転記する

const page1 =
`<SHA020-1 page="1">` +
`<ABH00000>${abh.join("")}</ABH00000>` +
`<ABI00000>${abi.join("")}</ABI00000>` +
`<ABJ00000>${abj.join("")}</ABJ00000>` +
`<ABL00000>${abl.join("")}</ABL00000>` +
`</SHA020-1>`;

// ---- 第2表（税額計算表） ----
const abm: string[] = [];
abm.push(ref("ABM00010", "NOZEISHA_ADR"));
if (t.phone) abm.push(ref("ABM00020", "NOZEISHA_TEL"));
const nameBlock2: string[] = [];
if (t.nameKana) nameBlock2.push(ref("ABM00040", "NOZEISHA_NM_KN"));
if (t.name) nameBlock2.push(ref("ABM00050", "NOZEISHA_NM"));
if (nameBlock2.length > 0) abm.push(`<ABM00030>${nameBlock2.join("")}</ABM00030>`);
abm.push(
`<ABM00090>${ref("ABM00100", "KAZEI_KIKAN_FROM")}${ref("ABM00110", "KAZEI_KIKAN_TO")}</ABM00090>`,
);
abm.push(ref("ABM00120", "SHINKOKU_KBN"));

const abp: string[] = [];
abp.push(amount("ABP00040", r.salesExcl8));
abp.push(amount("ABP00050", r.salesExcl10));
abp.push(amountAlways("ABP00060", r.salesExcl));
const abs: string[] = [];
abs.push(amount("ABS00040", r.outputTax8));
abs.push(amount("ABS00050", r.outputTax10));
// 地方消費税の課税標準となる消費税額 = 差引税額（100円未満切捨て後）
const localBase = r.diffNational;

const page2 =
`<SHA020-2 page="2">` +
`<ABM00000>${abm.join("")}</ABM00000>` +
amountAlways("ABO00000", r.taxBase) +
`<ABP00000>${abp.join("")}</ABP00000>` +
amountAlways("ABR00000", r.outputTax) +
`<ABS00000>${abs.join("")}</ABS00000>` +
(r.returnsTax? amountAlways("ABT00000", r.returnsTax): "") +
(r.returnsTax
? `<ABU00000>${amountAlways("ABU00010", r.returnsTax)}</ABU00000>`
: "") +
`<ABV00000>${amountAlways("ABV00010", localBase)}${amountAlways("ABV00040", localBase)}</ABV00000>` +
`</SHA020-2>`;

return (
`<SHA020 VR="9.0" id="SHA020" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(t.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
page1 +
page2 +
`</SHA020>`
);
}

// ---------------------------------------------------------------------------
// SHB047 付表4-3（税率別消費税額計算表）
// ---------------------------------------------------------------------------

function buildShb047(data: SimplifiedConsumptionXtxData): string {
const r = data.result;
const parts: string[] = [];
parts.push(
`<DUA00000><DUA00010>${ref("DUA00020", "KAZEI_KIKAN_FROM")}${ref("DUA00030", "KAZEI_KIKAN_TO")}</DUA00010>${ref("DUA00040", "NOZEISHA_NM")}</DUA00000>`,
);
parts.push(
`<DUB00000>${amount("DUB00010", r.base8)}${amount("DUB00020", r.base10)}${amountAlways("DUB00030", r.taxBase)}</DUB00000>`,
);
parts.push(
`<DUC00000>${amount("DUC00010", r.salesExcl8)}${amount("DUC00020", r.salesExcl10)}${amountAlways("DUC00030", r.salesExcl)}</DUC00000>`,
);
parts.push(
`<DUD00000>${amount("DUD00010", r.outputTax8)}${amount("DUD00020", r.outputTax10)}${amountAlways("DUD00030", r.outputTax)}</DUD00000>`,
);
const badDebtRecovery8 = Math.trunc(data.input.badDebtRecoveryTax8 || 0);
const badDebtRecovery10 = Math.trunc(data.input.badDebtRecoveryTax10 || 0);
parts.push(
`<DUE00000>${amount("DUE00010", badDebtRecovery8)}${amount("DUE00020", badDebtRecovery10)}${amount("DUE00030", r.badDebtRecoveryTax)}</DUE00000>`,
);
parts.push(
`<DUF00000>` +
`<DUF00010>${amount("DUF00020", r.inputTax8)}${amount("DUF00030", r.inputTax10)}${amountAlways("DUF00040", r.inputTax)}</DUF00010>` +
`<DUF00050>${amount("DUF00060", r.returnsTax8)}${amount("DUF00070", r.returnsTax10)}${amount("DUF00080", r.returnsTax)}</DUF00050>` +
`<DUF00090>${amount("DUF00100", Math.trunc(data.input.badDebtTax8 || 0))}${amount("DUF00110", Math.trunc(data.input.badDebtTax10 || 0))}${amount("DUF00120", r.badDebtTax)}</DUF00090>` +
`<DUF00130>${amount("DUF00140", r.creditSubtotal8)}${amount("DUF00150", r.creditSubtotal10)}${amountAlways("DUF00160", r.creditSubtotal)}</DUF00130>` +
`</DUF00000>`,
);
parts.push(amount("DUG00000", r.refundNational));
parts.push(amountAlways("DUH00000", r.diffNational));
parts.push(
`<DUI00000>${amount("DUI00010", r.refundNational)}${amountAlways("DUI00020", r.diffNational)}</DUI00000>`,
);
parts.push(
`<DUJ00000>${amount("DUJ00010", r.refundLocal)}${amountAlways("DUJ00020", r.localTaxGross)}</DUJ00000>`,
);
return (
`<SHB047 VR="1.0" id="SHB047" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(data.taxpayer.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
parts.join("") +
`</SHB047>`
);
}

// ---------------------------------------------------------------------------
// SHB067 付表5-3（控除対象仕入税額等の計算表）
// ---------------------------------------------------------------------------

/** みなし仕入率 → DVC00010 の区分コード（1:90% 2:80% 3:70% 4:60% 5:50% 6:40%）。 */
const RATE_KUBUN: Record<SimplifiedCategory, number> = {
1: 1,
2: 2,
3: 3,
4: 4,
5: 5,
6: 6,
};

/** 付表5-3 特例（ロ）のペア列挙順（高い方の区分, 低い方の区分）。 */
const SPECIAL2_PAIRS: [SimplifiedCategory, SimplifiedCategory][] = [
[1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
[2, 3], [2, 4], [2, 5], [2, 6],
[3, 4], [3, 5], [3, 6],
[4, 5], [4, 6],
[5, 6],
];

/** 付表5-3 明細の事業区分ごとのタグ組（(1)売上高・(2)消費税額）。 */
const DVD_SALES_TAGS: Record<
SimplifiedCategory,
{ group: string; g8: string; g10: string; wrap: string; total: string; share: string}
> = {
1: { group: "DVD00060", g8: "DVD00070", g10: "DVD00080", wrap: "DVD00090", total: "DVD00100", share: "DVD00110"},
2: { group: "DVD00120", g8: "DVD00130", g10: "DVD00140", wrap: "DVD00150", total: "DVD00160", share: "DVD00170"},
3: { group: "DVD00180", g8: "DVD00190", g10: "DVD00200", wrap: "DVD00210", total: "DVD00220", share: "DVD00230"},
4: { group: "DVD00240", g8: "DVD00250", g10: "DVD00260", wrap: "DVD00270", total: "DVD00280", share: "DVD00290"},
5: { group: "DVD00300", g8: "DVD00310", g10: "DVD00320", wrap: "DVD00330", total: "DVD00340", share: "DVD00350"},
6: { group: "DVD00360", g8: "DVD00370", g10: "DVD00380", wrap: "DVD00390", total: "DVD00400", share: "DVD00410"},
};

const DVD_TAX_TAGS: Record<
SimplifiedCategory,
{ group: string; g8: string; g10: string; total: string}
> = {
1: { group: "DVD00470", g8: "DVD00480", g10: "DVD00490", total: "DVD00500"},
2: { group: "DVD00510", g8: "DVD00520", g10: "DVD00530", total: "DVD00540"},
3: { group: "DVD00550", g8: "DVD00560", g10: "DVD00570", total: "DVD00580"},
4: { group: "DVD00590", g8: "DVD00600", g10: "DVD00610", total: "DVD00620"},
5: { group: "DVD00630", g8: "DVD00640", g10: "DVD00650", total: "DVD00660"},
6: { group: "DVD00670", g8: "DVD00680", g10: "DVD00690", total: "DVD00700"},
};

function buildShb067(data: SimplifiedConsumptionXtxData): string {
const r = data.result;
const badDebtRecovery8 = Math.trunc(data.input.badDebtRecoveryTax8 || 0);
const badDebtRecovery10 = Math.trunc(data.input.badDebtRecoveryTax10 || 0);

const page1: string[] = [];
page1.push(
`<DVA00000><DVA00010>${ref("DVA00020", "KAZEI_KIKAN_FROM")}${ref("DVA00030", "KAZEI_KIKAN_TO")}</DVA00010>${ref("DVA00040", "NOZEISHA_NM")}</DVA00000>`,
);
page1.push(
`<DVB00000>` +
`<DVB00010>${amount("DVB00020", r.outputTax8)}${amount("DVB00030", r.outputTax10)}${amountAlways("DVB00040", r.outputTax)}</DVB00010>` +
`<DVB00050>${amount("DVB00060", badDebtRecovery8)}${amount("DVB00070", badDebtRecovery10)}${amount("DVB00080", r.badDebtRecoveryTax)}</DVB00050>` +
`<DVB00090>${amount("DVB00100", r.returnsTax8)}${amount("DVB00110", r.returnsTax10)}${amount("DVB00120", r.returnsTax)}</DVB00090>` +
`<DVB00130>${amount("DVB00140", r.basis8)}${amount("DVB00150", r.basis10)}${amountAlways("DVB00160", r.basis8 + r.basis10)}</DVB00130>` +
`</DVB00000>`,
);

if (r.singleCategory!== null) {
page1.push(
`<DVC00000>${kubun("DVC00010", RATE_KUBUN[r.singleCategory])}${amount("DVC00020", r.inputTax8)}${amount("DVC00030", r.inputTax10)}${amountAlways("DVC00040", r.inputTax)}</DVC00000>`,
);
} else if (r.categories.length > 1) {
const salesGroups: string[] = [];
salesGroups.push(
`<DVD00020>${amount("DVD00030", r.salesExcl8)}${amount("DVD00040", r.salesExcl10)}${amountAlways("DVD00050", r.salesExcl)}</DVD00020>`,
);
for (const c of r.categories) {
const tags = DVD_SALES_TAGS[c.category];
salesGroups.push(
`<${tags.group}>${amount(tags.g8, c.excl8)}${amount(tags.g10, c.excl10)}<${tags.wrap}>${amountAlways(tags.total, c.exclTotal)}${percent(tags.share, c.sharePercent)}</${tags.wrap}></${tags.group}>`,
);
}
const taxGroups: string[] = [];
const taxTotal8 = r.categories.reduce((s, c) => s + c.tax8, 0);
const taxTotal10 = r.categories.reduce((s, c) => s + c.tax10, 0);
taxGroups.push(
`<DVD00430>${amount("DVD00440", taxTotal8)}${amount("DVD00450", taxTotal10)}${amountAlways("DVD00460", taxTotal8 + taxTotal10)}</DVD00430>`,
);
for (const c of r.categories) {
const tags = DVD_TAX_TAGS[c.category];
taxGroups.push(
`<${tags.group}>${amount(tags.g8, c.tax8)}${amount(tags.g10, c.tax10)}${amountAlways(tags.total, c.taxTotal)}</${tags.group}>`,
);
}
page1.push(
`<DVD00000><DVD00010>${salesGroups.join("")}</DVD00010><DVD00420>${taxGroups.join("")}</DVD00420></DVD00000>`,
);
}

const page2: string[] = [];
if (r.singleCategory === null && r.categories.length > 1) {
page2.push(
`<DVE00010>${amount("DVE00020", r.principleInputTax8)}${amount("DVE00030", r.principleInputTax10)}${amountAlways("DVE00040", r.principleInputTax8 + r.principleInputTax10)}</DVE00010>`,
);
}
if (r.specialOptions.length > 0) {
const specialBlocks: string[] = [];
const special1 = r.specialOptions.find((o) => o.rule === "special1");
if (special1 && special1.category!== undefined) {
specialBlocks.push(
`<DVE00060>${kubun("DVE00070", RATE_KUBUN[special1.category])}${amount("DVE00080", special1.inputTax8)}${amount("DVE00090", special1.inputTax10)}${amountAlways("DVE00100", special1.inputTax8 + special1.inputTax10)}</DVE00060>`,
);
}
const special2Options = r.specialOptions.filter((o) => o.rule === "special2");
if (special2Options.length > 0) {
const pairBlocks: string[] = [];
for (const option of special2Options) {
const higher = option.higher as SimplifiedCategory;
const lower = option.lower as SimplifiedCategory;
// ペアの並びは様式の列挙順（高い方の区分→低い方の区分）。
// グループタグは DVE00120 から 40 刻みで 15 ペア分が並ぶ。
const pairIndex = SPECIAL2_PAIRS.findIndex(([h, l]) => h === higher && l === lower);
const groupNo = 120 + pairIndex * 40;
const tag = (n: number): string => `DVE${String(n).padStart(5, "0")}`;
pairBlocks.push(
`<${tag(groupNo)}>${amount(tag(groupNo + 10), option.inputTax8)}${amount(tag(groupNo + 20), option.inputTax10)}${amountAlways(tag(groupNo + 30), option.inputTax8 + option.inputTax10)}</${tag(groupNo)}>`,
);
}
specialBlocks.push(`<DVE00110>${pairBlocks.join("")}</DVE00110>`);
}
page2.push(`<DVE00050>${specialBlocks.join("")}</DVE00050>`);
}
page2.push(
`<DVE00720>${amount("DVE00730", r.inputTax8)}${amount("DVE00740", r.inputTax10)}${amountAlways("DVE00750", r.inputTax)}</DVE00720>`,
);

return (
`<SHB067 VR="1.0" id="SHB067" page="1" sakuseiDay="${esc(data.submissionDate)}" ` +
`sakuseiNM="${esc(data.taxpayer.name)}" softNM="${SOFT_NAME}" xmlns="${SHOHI_NS}">` +
`<SHB067-1 page="1">${page1.join("")}</SHB067-1>` +
`<SHB067-2 page="2"><DVE00000>${page2.join("")}</DVE00000></SHB067-2>` +
`</SHB067>`
);
}

// ---------------------------------------------------------------------------
// 全体
// ---------------------------------------------------------------------------

/**
* 消費税申告（簡易課税用・個人）の XTX を生成する。
* 生成物は署名なしの組み込み用データで、送信は e-Tax 側で本人が行う。
*/
export function buildSimplifiedConsumptionXtx(data: SimplifiedConsumptionXtxData): string {
const taxpayer = normalizeXtxTaxpayer(data.taxpayer, {
submissionDate: data.submissionDate,
periodFrom: data.periodFrom,
periodTo: data.periodTo,
filingKind: data.filingKind,
});
const normalized: SimplifiedConsumptionXtxData = {...data, taxpayer};
const forms: { id: string; xml: string}[] = [
{ id: "SHA020", xml: buildSha020(normalized)},
{ id: "SHB047", xml: buildShb047(normalized)},
{ id: "SHB067", xml: buildShb067(normalized)},
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
`<RSH0030 VR="26.0.0" id="RSH0030" xmlns="${SHOHI_NS}" xmlns:gen="http://xml.e-tax.nta.go.jp/XSD/general">` +
catalog +
`<CONTENTS id="CONTENTS">${buildShohiIt(normalized, "RSH0030")}${forms.map((f) => f.xml).join("")}</CONTENTS>` +
`</RSH0030></DATA>`
);
}
