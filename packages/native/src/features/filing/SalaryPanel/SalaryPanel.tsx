import {
  SalaryIncomeInput,
  salaryAdjustmentDeduction1,
  salaryDeductionAmount,
  salaryIncomeAmount,
} from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Card, SwitchRow } from "@/components";
import { space } from "@/theme";
import { formatNumber } from "@/utils";
import { AmountField, SectionHead } from "../fields";

export interface SalaryPanelProps {
  year: number;
  salaryIncome: SalaryIncomeInput;
  onChange: (next: SalaryIncomeInput) => void;
}

/**
 * 給与所得の入力。帳簿は事業・不動産しか持たないため、勤務先からの給与は
 * ここで入れる。収入金額（源泉徴収票の支払金額）だけを入力し、所得金額は
 * 給与所得控除を引いて自動計算する。第一表の「給与」（収入金額オ・
 * 所得金額⑥）に対応し、合計所得と税額計算に含まれる。
 * 所得金額調整控除（子ども・特別障害者等）の対象ならチェックを付けると
 * 控除が差し引かれる。給与と公的年金等の両方がある場合の調整控除は、
 * 雑所得の入力と合わせて自動計算される。
 */
export function SalaryPanel({ year, salaryIncome, onChange }: SalaryPanelProps) {
  const revenue = salaryIncome.revenue;
  const adjustmentEligible = salaryIncome.adjustmentEligible === true;
  const adjustment1 = salaryAdjustmentDeduction1(revenue, adjustmentEligible);
  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="給与所得"
          description="勤務先からの給与がある場合は、源泉徴収票の「支払金額」を入力してください。給与所得控除は年分に応じて自動で計算します。"
        />
        <AmountField
          label="給与等の収入金額"
          value={revenue}
          onChange={(v) => onChange({ ...salaryIncome, revenue: v })}
        />
        <SwitchRow
          label="所得金額調整控除の対象"
          description="本人が特別障害者／23歳未満の扶養親族がいる／特別障害者である同一生計配偶者・扶養親族がいる（給与収入850万円超の場合に適用）"
          value={adjustmentEligible}
          onChange={(v) => onChange({ ...salaryIncome, adjustmentEligible: v })}
        />
        {revenue > 0 ? (
          <AppText size="sm" tone="muted">
            給与所得控除 {formatNumber(salaryDeductionAmount(year, revenue))} 円
            {adjustment1 > 0 ? ` ／ 所得金額調整控除 ${formatNumber(adjustment1)} 円` : ""}
            {" ／ "}給与所得の金額{" "}
            {formatNumber(salaryIncomeAmount(year, revenue) - adjustment1)} 円
            （公的年金等がある場合は、給与と年金の調整控除がさらに差し引かれます）
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
