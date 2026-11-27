import { IncomeDeductionBreakdown } from "@etax/shared";

/**
 * deductionFields.ts — 所得控除の内訳表示ラベル
 * （エンジンの内訳キー → 正式名称）。
 */
export const deductionLabels: readonly { key: keyof IncomeDeductionBreakdown; label: string }[] = [
  { key: "casualtyLoss", label: "雑損控除" },
  { key: "medical", label: "医療費控除" },
  { key: "socialInsurance", label: "社会保険料控除" },
  { key: "smallBusinessMutualAid", label: "小規模企業共済等掛金控除" },
  { key: "lifeInsurance", label: "生命保険料控除" },
  { key: "earthquakeInsurance", label: "地震保険料控除" },
  { key: "donations", label: "寄附金控除" },
  { key: "disability", label: "障害者控除" },
  { key: "widow", label: "寡婦控除" },
  { key: "singleParent", label: "ひとり親控除" },
  { key: "workingStudent", label: "勤労学生控除" },
  { key: "spouse", label: "配偶者控除" },
  { key: "spouseSpecial", label: "配偶者特別控除" },
  { key: "dependents", label: "扶養控除" },
  { key: "specialRelative", label: "特定親族特別控除" },
  { key: "basic", label: "基礎控除" },
];
