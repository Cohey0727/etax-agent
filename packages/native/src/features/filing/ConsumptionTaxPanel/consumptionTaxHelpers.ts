import { ConsumptionReturn, Transaction, summarizeConsumptionTax } from "@etax/shared";
import { formatYen } from "@/utils";

/**
 * consumptionTaxHelpers.ts — 消費税画面の計算補助。
 */

/** 消費税額の裏付け表記（課税標準額 × 税率の内訳）。 */
export function outputTaxBacking(preview: ConsumptionReturn): string {
  const parts: string[] = [];
  if (preview.base10 > 0) parts.push(`10%分 ${formatYen(preview.base10)} × 7.8%`);
  if (preview.base8 > 0) parts.push(`軽減8%分 ${formatYen(preview.base8)} × 6.24%`);
  return parts.length > 0 ? `課税標準額 ${parts.join(" ＋ ")}` : "課税標準額なし";
}

/**
 * 基準期間（2年前）の課税売上高（千円・税抜）を帳簿から出す。
 * 2年前の帳簿が無ければ 0（手入力で直す前提）。
 */
export function deriveBasePeriodSalesThousands(
  transactions: Transaction[],
  year: number,
): number {
  const base = summarizeConsumptionTax(transactions, year - 2);
  const excl10 = Math.floor((base.salesIncl10 * 100) / 110);
  const excl8 = Math.floor((base.salesIncl8 * 100) / 108);
  return Math.floor((excl10 + excl8) / 1000);
}

/** 計算結果の各項目と、その裏付け（どう計算したか）を並べた表示行を作る。 */
export function buildResultRows(
  preview: ConsumptionReturn,
  form: { interimNational: number; interimLocal: number },
): readonly { label: string; value: string; backing: string }[] {
  return [
    {
      label: "課税売上割合",
      value: `${preview.ratio}%`,
      backing:
        `課税売上高（税抜）${formatYen(preview.salesExcl)} ÷ 売上高の合計（税抜）` +
        `${formatYen(preview.totalSalesExcl)} ・ ${preview.fullDeduction ? "全額控除" : "一括比例配分"}`,
    },
    {
      label: "課税標準額",
      value: formatYen(preview.taxBase),
      backing: "課税売上高（税抜）の千円未満を切り捨て",
    },
    {
      label: "消費税額",
      value: formatYen(preview.outputTax),
      backing: outputTaxBacking(preview),
    },
    {
      label: "控除対象仕入税額",
      value: formatYen(preview.inputTax),
      backing: preview.fullDeduction
        ? `課税仕入にかかる消費税額 ${formatYen(preview.inputTaxRaw10 + preview.inputTaxRaw8)} の全額`
        : `課税仕入にかかる消費税額 ${formatYen(preview.inputTaxRaw10 + preview.inputTaxRaw8)} × 課税売上割合 ${preview.ratio}%`,
    },
    preview.refundNational > 0
      ? {
          label: "還付税額（国税）",
          value: formatYen(preview.refundNational),
          backing: `消費税額 ${formatYen(preview.outputTax)} − 控除対象仕入税額 ${formatYen(preview.inputTax)}`,
        }
      : {
          label: "納付税額（国税）",
          value: formatYen(preview.payableNational),
          backing:
            `消費税額 ${formatYen(preview.outputTax)} − 控除対象仕入税額 ${formatYen(preview.inputTax)}` +
            ` = ${formatYen(preview.diffNational)}` +
            (form.interimNational > 0 ? ` − 中間納付 ${formatYen(form.interimNational)}` : ""),
        },
    preview.refundLocal > 0
      ? {
          label: "還付譲渡割額（地方）",
          value: formatYen(preview.refundLocal),
          backing: `還付税額（国税）× 22/78`,
        }
      : {
          label: "納付譲渡割額（地方）",
          value: formatYen(preview.payableLocal),
          backing:
            `差引税額（国税）${formatYen(preview.diffNational)} × 22/78 = ${formatYen(preview.localTaxGross)}` +
            (form.interimLocal > 0 ? ` − 中間納付 ${formatYen(form.interimLocal)}` : ""),
        },
    {
      label: "合計",
      value: formatYen(preview.totalPayable),
      backing: `国税 ${formatYen(preview.payableNational)} ＋ 地方 ${formatYen(preview.payableLocal)}`,
    },
  ];
}
