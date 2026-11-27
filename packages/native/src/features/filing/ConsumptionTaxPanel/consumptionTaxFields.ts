import { ConsumptionFilingInputs, ConsumptionTaxSummary } from "@etax/shared";

/**
 * consumptionTaxFields.ts — 消費税画面の手入力フォーム定義と集計行定義。
 */

/** 帳簿の外にある金額の手入力（申告入力の consumptionFiling に保存する）。 */
export type ConsumptionAmountKey = keyof Pick<
  ConsumptionFilingInputs,
  "interimNational" | "interimLocal" | "originalNational" | "originalLocal"
>;

export const INTERIM_FIELDS: readonly { key: ConsumptionAmountKey; label: string }[] = [
  { key: "interimNational", label: "中間納付税額（国税）" },
  { key: "interimLocal", label: "中間納付譲渡割額（地方）" },
];

export const AMENDMENT_FIELDS: readonly { key: ConsumptionAmountKey; label: string }[] = [
  { key: "originalNational", label: "既確定税額（国税）" },
  { key: "originalLocal", label: "既確定譲渡割額（地方）" },
];

export const SUMMARY_ROWS: readonly { key: keyof ConsumptionTaxSummary; label: string }[] = [
  { key: "salesIncl10", label: "課税売上（税込）・10%" },
  { key: "salesIncl8", label: "課税売上（税込）・軽減8%" },
  { key: "nontaxableSales", label: "非課税売上（対価の額）" },
  { key: "exemptSales", label: "免税売上（対価の額）" },
  { key: "purchasesIncl10", label: "課税仕入（税込）・10%" },
  { key: "purchasesIncl8", label: "課税仕入（税込）・軽減8%" },
];
