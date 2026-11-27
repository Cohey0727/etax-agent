import { ConsumptionReturn } from "@etax/shared";
import { formatYen } from "@utils";

/**
 * consumptionTaxHelpers.ts — 消費税画面の計算結果の表示行。
 */

/** 消費税額の裏付け表記（課税標準額 × 税率の内訳）。 */
export function outputTaxBacking(preview: ConsumptionReturn): string {
  const parts: string[] = [];
  if (preview.base10 > 0) parts.push(`10%分 ${formatYen(preview.base10)} × 7.8%`);
  if (preview.base8 > 0) parts.push(`軽減8%分 ${formatYen(preview.base8)} × 6.24%`);
  return parts.length > 0 ? `課税標準額 ${parts.join(" ＋ ")}` : "課税標準額なし";
}

/** 計算結果の値の単位（表示の整形の仕方）。 */
export type ConsumptionResultUnit = "percent" | "yen";

/** 計算結果の1行。値は数値のまま持ち、裏付けは計算のしかたを説明する文。 */
export interface ConsumptionResultRow {
  label: string;
  value: number;
  unit: ConsumptionResultUnit;
  backing: string;
}

/** 計算結果の各項目と、その裏付け（どう計算したか）を並べた表示行を作る。 */
export function buildResultRows(
  preview: ConsumptionReturn,
  form: { interimNational: number; interimLocal: number },
): readonly ConsumptionResultRow[] {
  return [
    {
      label: "課税売上割合",
      value: preview.ratio,
      unit: "percent",
      backing:
        `課税売上高（税抜）${formatYen(preview.salesExcl)} ÷ 売上高の合計（税抜）` +
        `${formatYen(preview.totalSalesExcl)} ・ ${preview.fullDeduction ? "全額控除" : "一括比例配分"}`,
    },
    {
      label: "課税標準額",
      value: preview.taxBase,
      unit: "yen",
      backing: "課税売上高（税抜）の千円未満を切り捨て",
    },
    {
      label: "消費税額",
      value: preview.outputTax,
      unit: "yen",
      backing: outputTaxBacking(preview),
    },
    {
      label: "控除対象仕入税額",
      value: preview.inputTax,
      unit: "yen",
      backing: preview.fullDeduction
        ? `課税仕入にかかる消費税額 ${formatYen(preview.inputTaxRaw10 + preview.inputTaxRaw8)} の全額`
        : `課税仕入にかかる消費税額 ${formatYen(preview.inputTaxRaw10 + preview.inputTaxRaw8)} × 課税売上割合 ${preview.ratio}%`,
    },
    preview.refundNational > 0
      ? {
          label: "還付税額（国税）",
          value: preview.refundNational,
          unit: "yen",
          backing: `消費税額 ${formatYen(preview.outputTax)} − 控除対象仕入税額 ${formatYen(preview.inputTax)}`,
        }
      : {
          label: "納付税額（国税）",
          value: preview.payableNational,
          unit: "yen",
          backing:
            `消費税額 ${formatYen(preview.outputTax)} − 控除対象仕入税額 ${formatYen(preview.inputTax)}` +
            ` = ${formatYen(preview.diffNational)}` +
            (form.interimNational > 0 ? ` − 中間納付 ${formatYen(form.interimNational)}` : ""),
        },
    preview.refundLocal > 0
      ? {
          label: "還付譲渡割額（地方）",
          value: preview.refundLocal,
          unit: "yen",
          backing: `還付税額（国税）× 22/78`,
        }
      : {
          label: "納付譲渡割額（地方）",
          value: preview.payableLocal,
          unit: "yen",
          backing:
            `差引税額（国税）${formatYen(preview.diffNational)} × 22/78 = ${formatYen(preview.localTaxGross)}` +
            (form.interimLocal > 0 ? ` − 中間納付 ${formatYen(form.interimLocal)}` : ""),
        },
    {
      label: "合計",
      value: preview.totalPayable,
      unit: "yen",
      backing: `国税 ${formatYen(preview.payableNational)} ＋ 地方 ${formatYen(preview.payableLocal)}`,
    },
  ];
}
