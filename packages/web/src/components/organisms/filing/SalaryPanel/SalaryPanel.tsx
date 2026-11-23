import { SalaryIncomeInput, salaryDeductionAmount, salaryIncomeAmount } from "@etax/shared";
import { Card, Col, Input, Row, Text } from "@components/atoms";
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
 */
export const SalaryPanel = ({ year, salaryIncome, onChange }: SalaryPanelProps) => {
  const revenue = salaryIncome.revenue;
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
            onChange={(e) => onChange({ revenue: toAmount(e.target.value) })}
            aria-label="給与等の収入金額"
          />
        </Row>
        {revenue > 0 ? (
          <Text variant="muted">
            給与所得控除 {salaryDeductionAmount(year, revenue).toLocaleString()} 円 ／
            給与所得の金額 {salaryIncomeAmount(year, revenue).toLocaleString()} 円
          </Text>
        ) : null}
      </Col>
    </Card>
  );
};

/** 金額入力の文字列を数値へ寄せる（空・不正は 0）。 */
function toAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
