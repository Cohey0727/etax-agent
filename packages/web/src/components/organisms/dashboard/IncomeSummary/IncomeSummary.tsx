import { BlueDeduction, IncomeBreakdown } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./IncomeSummary.css";

export interface IncomeSummaryProps {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
}

export const IncomeSummary = ({ breakdown, blue }: IncomeSummaryProps) => {
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
            <Text variant="statLabel">不動産分（上限10万円）</Text>
            <Text>{formatYen(blue.realEstate)}</Text>
          </Col>
          <Col gap="none">
            <Text variant="statLabel">事業分（上限65万円）</Text>
            <Text>{formatYen(blue.business)}</Text>
          </Col>
          <Col gap="none">
            <Text variant="statLabel">合計（最大75万円）</Text>
            <Text variant="statValue">{formatYen(blue.total)}</Text>
          </Col>
        </Col>
      </Card>
    </div>
  );
};

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
