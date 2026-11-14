/**
 * deductionStorage.ts — 控除・税額控除の入力を年度ごとに端末へ保存する。
 * 申告済みの数字（AmendDiffPanel の loadOriginal）と対になる保存層。
 * 保存値が壊れていても空の入力にフォールバックする。
 */
import {
  DeductionInputs,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
  TaxCreditInputs,
} from "@etax/shared";

export interface DeductionState {
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
}

/** 空の入力状態（EMPTY 定数をそのまま共有しないよう複製する）。 */
export function freshDeductionState(): DeductionState {
  return {
    deductions: {
      ...EMPTY_DEDUCTION_INPUTS,
      lifeInsurance: { ...EMPTY_DEDUCTION_INPUTS.lifeInsurance },
      earthquakeInsurance: { ...EMPTY_DEDUCTION_INPUTS.earthquakeInsurance },
      dependents: { ...EMPTY_DEDUCTION_INPUTS.dependents },
      disability: { ...EMPTY_DEDUCTION_INPUTS.disability },
      casualtyLoss: null,
    },
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  };
}

function storageKey(year: number): string {
  return `etax-amend-deductions-${year}`;
}

export function loadDeductionState(year: number): DeductionState {
  const base = freshDeductionState();
  try {
    const raw = localStorage.getItem(storageKey(year));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DeductionState>;
    const d = (parsed.deductions ?? {}) as Partial<DeductionInputs>;
    const deductions: DeductionInputs = {
      ...base.deductions,
      ...d,
      lifeInsurance: { ...base.deductions.lifeInsurance, ...(d.lifeInsurance ?? {}) },
      earthquakeInsurance: {
        ...base.deductions.earthquakeInsurance,
        ...(d.earthquakeInsurance ?? {}),
      },
      dependents: { ...base.deductions.dependents, ...(d.dependents ?? {}) },
      disability: { ...base.deductions.disability, ...(d.disability ?? {}) },
      casualtyLoss: d.casualtyLoss ?? null,
      spouseCategory:
        d.spouseCategory === "general" || d.spouseCategory === "elderly"
          ? d.spouseCategory
          : "none",
    };
    return {
      deductions,
      taxCredits: { ...base.taxCredits, ...(parsed.taxCredits ?? {}) },
    };
  } catch {
    return base;
  }
}

export function saveDeductionState(year: number, state: DeductionState): void {
  try {
    localStorage.setItem(storageKey(year), JSON.stringify(state));
  } catch {
    // 保存できない環境ではそのまま編集を続ける。
  }
}
