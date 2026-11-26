import { ConsumptionTaxSummary } from "@etax/shared";

/**
 * consumptionTaxFields.ts — 消費税画面の手入力フォーム定義と集計行定義。
 */

/** 帳簿の外にある数字だけを手入力するフォーム。 */
export interface EditableForm {
  basePeriodSalesThousands: number;
  interimNational: number;
  interimLocal: number;
  originalNational: number;
  originalLocal: number;
}

export type EditableKey = keyof EditableForm;

export const EDITABLE_FIELDS: readonly { key: EditableKey; label: string }[] = [
  { key: "basePeriodSalesThousands", label: "基準期間の課税売上高（千円）" },
  { key: "interimNational", label: "中間納付税額（国税）" },
  { key: "interimLocal", label: "中間納付譲渡割額（地方）" },
];

export const AMENDMENT_FIELDS: readonly { key: EditableKey; label: string }[] = [
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
