import { IncomeDeductionBreakdown } from "@etax/shared";
import { Button, Input, Row, Text } from "@components/atoms";
import { toAmount } from "@utils/amountInput";
import styles from "./DeductionPanel.css";

/**
 * deductionFields.tsx — 控除画面の入力部品（空欄可金額・切替ボタン）と
 * 所得控除の内訳表示ラベル。
 */

/** 所得控除の内訳表示ラベル（エンジンの内訳キー → 正式名称）。 */
export const DEDUCTION_LABELS: readonly { key: keyof IncomeDeductionBreakdown; label: string }[] = [
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

interface NullableAmountFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

export const NullableAmountField = ({ label, value, onChange }: NullableAmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="number"
      value={value ?? ""}
      placeholder="対象がいなければ空欄"
      onChange={(e) => onChange(e.target.value === "" ? null : toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export const ToggleButton = ({ label, active, onClick }: ToggleButtonProps) => (
  <Button variant={active ? "tabActive" : "tab"} size="sm" onClick={onClick}>
    {label}
    {active ? " ✓" : ""}
  </Button>
);
