/**
 * consumptionTaxFields.ts — 消費税画面の手入力フォーム定義。
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
