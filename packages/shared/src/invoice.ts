/**
 * invoice.ts — 請求書（適格請求書）の金額計算（決定的な純粋関数）。
 *
 * 金額の約束:
 * - 単価は税抜。明細金額 = 数量 × 単価（円未満は切り捨て）。
 * - 消費税額は「一の適格請求書につき、税率ごとに1回」だけ端数処理する
 *   （消費税法施行令70条の10）。明細ごとに税額を丸めることはしない。
 * - 端数処理の方法（切捨て／四捨五入／切上げ）は帳票ごとに選べる。
 *   法令上いずれも許容されるため、既定は切捨てとする。
 * - 税率 0% は対象外・非課税の明細用（消費税額は常に 0）。
 */

/** 消費税額の端数処理方法。 */
export type InvoiceTaxRounding = "floor" | "round" | "ceil";

/** 請求書の明細1行（計算入力）。金額はすべて number で持つ。 */
export interface InvoiceLineInput {
  /** 取引内容（品目・サービス名） */
  itemName: string;
  /** 数量（時間・個数など。小数可） */
  quantity: number;
  /** 単位（時間・個・式など。表示用） */
  unit: string;
  /** 税抜単価（円） */
  unitPrice: number;
  /** 適用税率（%）。10 / 8（軽減）/ 0（対象外） */
  taxRatePercent: number;
  /** 軽減税率の対象品目か（適格請求書では取引内容にその旨が必要） */
  isReducedRate: boolean;
}

/** 税率ごとの集計（適格請求書の記載事項 4・5 の元になる）。 */
export interface InvoiceRateGroup {
  taxRatePercent: number;
  /** 税率ごとに区分した合計金額（税抜） */
  subtotal: number;
  /** 税率ごとに区分した消費税額等 */
  tax: number;
}

/** 請求書全体の集計。 */
export interface InvoiceTotals {
  /** 税率の降順（10 → 8 → 0）の税率別集計。明細のある税率だけを含む */
  groups: InvoiceRateGroup[];
  /** 税抜合計 */
  subtotal: number;
  /** 消費税額合計 */
  taxTotal: number;
  /** 税込合計（請求金額） */
  total: number;
}

/** 浮動小数の誤差を吸収してから端数処理する（taxcalc の floorYen と同じ考え方）。 */
function applyRounding(value: number, rounding: InvoiceTaxRounding): number {
  const epsilon = 1e-9;
  switch (rounding) {
    case "round":
      return Math.round(value + epsilon);
    case "ceil":
      return Math.ceil(value - epsilon);
    case "floor":
      return Math.floor(value + epsilon);
  }
}

/** 明細金額（税抜）。数量 × 単価の円未満は切り捨てる。 */
export function invoiceLineAmount(line: InvoiceLineInput): number {
  return Math.floor(line.quantity * line.unitPrice + 1e-9);
}

/**
 * 明細から税率ごとの集計と合計を求める。
 * 消費税額の端数処理は税率ごとに1回だけ（ここでしか丸めない）。
 */
export function computeInvoiceTotals(
  lines: readonly InvoiceLineInput[],
  rounding: InvoiceTaxRounding,
): InvoiceTotals {
  const subtotalByRate = new Map<number, number>();
  for (const line of lines) {
    const amount = invoiceLineAmount(line);
    subtotalByRate.set(line.taxRatePercent, (subtotalByRate.get(line.taxRatePercent) ?? 0) + amount);
  }
  const groups: InvoiceRateGroup[] = [...subtotalByRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taxRatePercent, subtotal]) => ({
      taxRatePercent,
      subtotal,
      tax: taxRatePercent === 0 ? 0 : applyRounding((subtotal * taxRatePercent) / 100, rounding),
    }));
  const subtotal = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const taxTotal = groups.reduce((sum, group) => sum + group.tax, 0);
  return { groups, subtotal, taxTotal, total: subtotal + taxTotal };
}
