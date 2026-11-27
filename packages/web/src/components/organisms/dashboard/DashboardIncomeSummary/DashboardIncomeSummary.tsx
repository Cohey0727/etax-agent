import { BlueDeduction, IncomeBreakdown } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./DashboardIncomeSummary.css";

export interface DashboardIncomeSummaryProps {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
  /**
   * 青色申告特別控除の限度額（不動産・事業・農業を合わせた所得に対する額。白色は 0）。
   * 申告の種類の変更は納税者情報画面で行う。
   */
  blueDeductionLimit: number;
  /** 申告入力に農業所得があるか（青色申告特別控除の農業分を出す） */
  hasAgricultureIncome: boolean;
}

export const DashboardIncomeSummary = ({
  breakdown,
  blue,
  blueDeductionLimit,
  hasAgricultureIncome,
}: DashboardIncomeSummaryProps) => {
  // 限度額は不動産・事業・農業を合わせた所得に対する1つの額なので、合計の行にだけ出す。
  const totalLabel =
    blueDeductionLimit > 0 ? `合計（最大${formatCap(blueDeductionLimit)}）` : "合計";
  return (
    <div className={styles.grid}>
      <IncomeStatCard
        title="事業所得"
        revenue={breakdown.businessRevenue}
        expenses={breakdown.businessExpenses}
        income={breakdown.businessIncome}
        incomeAfterDeduction={breakdown.businessIncome - blue.business}
      />
      <IncomeStatCard
        title="不動産所得"
        revenue={breakdown.realEstateRevenue}
        expenses={breakdown.realEstateExpenses}
        income={breakdown.realEstateIncome}
        incomeAfterDeduction={breakdown.realEstateIncome - blue.realEstate}
      />
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">青色申告特別控除</Text>
          <Col gap="none">
            <Text variant="statLabel">不動産分</Text>
            <Text>{formatYen(blue.realEstate)}</Text>
          </Col>
          <Col gap="none">
            <Text variant="statLabel">事業分</Text>
            <Text>{formatYen(blue.business)}</Text>
          </Col>
          {hasAgricultureIncome ? (
            <Col gap="none">
              <Text variant="statLabel">農業分</Text>
              <Text>{formatYen(blue.agriculture)}</Text>
            </Col>
          ) : null}
          <Col gap="none">
            <Text variant="statLabel">{totalLabel}</Text>
            <Text variant="statValue">{formatYen(blue.total)}</Text>
          </Col>
        </Col>
      </Card>
    </div>
  );
};

/** 上限額を「65万円」の形で出す。 */
function formatCap(amount: number): string {
  return `${amount / 10_000}万円`;
}

interface IncomeStatCardProps {
  title: string;
  revenue: number;
  expenses: number;
  income: number;
  incomeAfterDeduction: number;
}

const IncomeStatCard = ({
  title,
  revenue,
  expenses,
  income,
  incomeAfterDeduction,
}: IncomeStatCardProps) => {
  return (
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">{title}</Text>
        <Col gap="none">
          <Text variant="statLabel">収入</Text>
          <Text variant="statValue">{formatYen(revenue)}</Text>
        </Col>
        <Col gap="none">
          <Text variant="statLabel">経費</Text>
          <Text>{formatYen(expenses)}</Text>
        </Col>
        <Col gap="none">
          <Text variant="statLabel">所得（控除前）</Text>
          <Text>
            <strong>{formatYen(income)}</strong>
          </Text>
        </Col>
        <Col gap="none">
          <Text variant="statLabel">青色申告特別控除後</Text>
          <Text>
            <strong>{formatYen(incomeAfterDeduction)}</strong>
          </Text>
        </Col>
      </Col>
    </Card>
  );
};
