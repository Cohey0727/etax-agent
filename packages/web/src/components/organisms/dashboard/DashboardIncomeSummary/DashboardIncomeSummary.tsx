import { BlueDeduction, FilingType, IncomeBreakdown, blueDeductionCaps } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./DashboardIncomeSummary.css";

export interface DashboardIncomeSummaryProps {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
  /** 申告の種類（青色申告特別控除の区分）。変更は納税者情報画面で行う。 */
  filingType: FilingType;
  /** 不動産貸付けが事業的規模か */
  realEstateBusinessScale: boolean;
  /** 申告入力に農業所得があるか（青色申告特別控除の農業分を出す） */
  hasAgricultureIncome: boolean;
}

export const DashboardIncomeSummary = ({
  breakdown,
  blue,
  filingType,
  realEstateBusinessScale,
  hasAgricultureIncome,
}: DashboardIncomeSummaryProps) => {
  const caps = blueDeductionCaps({ filingType, realEstateBusinessScale });
  // 事業・不動産を合算して上限がかかる場合は、内訳ごとの上限は出さない。
  const pooled = filingType === "blue10" || realEstateBusinessScale || filingType === "white";
  const realEstateLabel = pooled ? "不動産分" : `不動産分（上限${formatCap(caps.realEstate)}）`;
  const businessLabel = pooled ? "事業分" : `事業分（上限${formatCap(caps.business)}）`;
  const totalLabel = filingType === "white" ? "合計" : `合計（最大${formatCap(caps.total)}）`;
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
            <Text variant="statLabel">{realEstateLabel}</Text>
            <Text>{formatYen(blue.realEstate)}</Text>
          </Col>
          <Col gap="none">
            <Text variant="statLabel">{businessLabel}</Text>
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
