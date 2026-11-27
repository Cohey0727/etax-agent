/**
 * declaredIncomeTax.ts — 提出パネルに出す申告納税額と第3期分の税額。
 */
import { IncomeTaxResult } from "@etax/shared";

export interface DeclaredIncomeTax {
  /** 申告納税額。100円未満切捨て。源泉徴収税額の方が多い（還付になる）ときは切り捨てず負のまま */
  declaredTax: number;
  /** 第3期分の税額（申告納税額 − 予定納税額）。正は納める税金、負は還付される税金 */
  thirdPeriodTax: number;
}

/**
 * 所得税及び復興特別所得税の額から源泉徴収税額・予定納税額を精算する。
 * withholdingTax は提出パネルの源泉徴収税額と、配当・株式等譲渡の入力の源泉徴収税額の合計。
 */
export function declaredIncomeTax(
  taxResult: IncomeTaxResult,
  withholdingTax: number,
  prepaidTax: number,
): DeclaredIncomeTax {
  const raw = taxResult.standardIncomeTax + taxResult.reconstructionTax - withholdingTax;
  const declaredTax = raw > 0 ? Math.floor(raw / 100) * 100 : raw;
  return { declaredTax, thirdPeriodTax: declaredTax - prepaidTax };
}
