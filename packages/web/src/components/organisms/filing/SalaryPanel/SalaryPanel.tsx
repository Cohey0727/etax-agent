import {
  SalaryIncomeInput,
  salaryAdjustmentDeduction1,
  salaryDeductionAmount,
  salaryIncomeAmount,
} from "@etax/shared";
import { Card, Col, Input, Row, Text } from "@components/atoms";
import { toAmount } from "@utils/amountInput";
import styles from "./SalaryPanel.css";

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
export const SalaryPanel = ({ year, salaryIncome, onChange }: SalaryPanelProps) => {
  const revenue = salaryIncome.revenue;
  const adjustmentEligible = salaryIncome.adjustmentEligible === true;
  const adjustment1 = salaryAdjustmentDeduction1(revenue, adjustmentEligible);
  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">給与所得</Text>
          <Text variant="muted">
            勤務先からの給与がある場合は、源泉徴収票の「支払金額」を入力してください。
            給与所得控除は年分に応じて自動で計算します。
          </Text>
        </Col>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">給与等の収入金額</Text>
          </div>
          <Input
            className={styles.fieldInput}
            type="number"
            value={revenue}
            onChange={(e) => onChange({ ...salaryIncome, revenue: toAmount(e.target.value) })}
            aria-label="給与等の収入金額"
          />
        </Row>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">所得金額調整控除の対象</Text>
          </div>
          <label>
            <Row gap="sm" align="center">
              <input
                type="checkbox"
                checked={adjustmentEligible}
                onChange={(e) => onChange({ ...salaryIncome, adjustmentEligible: e.target.checked })}
                aria-label="所得金額調整控除の対象"
              />
              <Text variant="muted">
                本人が特別障害者／23歳未満の扶養親族がいる／特別障害者である同一生計配偶者・扶養親族がいる（給与収入850万円超の場合に適用）
              </Text>
            </Row>
          </label>
        </Row>
        {revenue > 0 ? (
          <Text variant="muted">
            給与所得控除 {salaryDeductionAmount(year, revenue).toLocaleString()} 円
            {adjustment1 > 0 ? ` ／ 所得金額調整控除 ${adjustment1.toLocaleString()} 円` : ""}
            {" ／ "}給与所得の金額{" "}
            {(salaryIncomeAmount(year, revenue) - adjustment1).toLocaleString()} 円
            （公的年金等がある場合は、給与と年金の調整控除がさらに差し引かれます）
          </Text>
        ) : null}
      </Col>
    </Card>
  );
};
