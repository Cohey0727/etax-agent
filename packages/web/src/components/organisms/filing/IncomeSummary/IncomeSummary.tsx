import {
  BlueDeductionOptions,
  Transaction,
  computeCorrectedFigures,
  filterYear,
} from "@etax/shared";
import { useMemo } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./IncomeSummary.css";

export interface IncomeSummaryProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
}

/**
 * 「帳簿」行の直下に置く所得の要約。帳簿を見直したら、その結果である
 * 所得の数字を真下で確認して、そのまま「確定」にできるようにする。
 */
export const IncomeSummary = ({ transactions, year, filingOptions }: IncomeSummaryProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, filingOptions?.filingType, filingOptions?.realEstateBusinessScale],
  );

  if (yearTransactions.length === 0) {
    return (
      <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>
    );
  }

  const isWhite = filingOptions?.filingType === "white";
  const suffix = isWhite ? "" : "（青色控除後）";
  const totalIncome = figures._detail.business_income + figures._detail.real_estate_income;
  const statCards: readonly { label: string; value: string }[] = [
    { label: `事業所得${suffix}`, value: formatYen(figures._detail.business_income) },
    { label: `不動産所得${suffix}`, value: formatYen(figures._detail.real_estate_income) },
    { label: "所得合計", value: formatYen(totalIncome) },
  ];
  const incomeRows: readonly { label: string; amount: number }[] = [
    { label: "事業収入", amount: figures.business_revenue },
    { label: "事業経費", amount: figures.business_expenses },
    { label: "不動産収入", amount: figures.real_estate_revenue },
    { label: "不動産経費", amount: figures.real_estate_expenses },
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: figures.blue_deduction,
    },
  ];

  return (
    <Col gap="md">
      <div className={styles.statGrid}>
        {statCards.map((card) => (
          <Card key={card.label}>
            <Col gap="none">
              <Text variant="statLabel">{card.label}</Text>
              <Text variant="statValue">{card.value}</Text>
            </Col>
          </Card>
        ))}
      </div>
      <Col gap="sm">
        {incomeRows.map((row) => (
          <Row key={row.label} align="center" justify="spaceBetween">
            <Text variant="muted">{row.label}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))}
        <Row align="center" justify="spaceBetween" className={styles.totalRow}>
          <Text>所得合計{suffix}</Text>
          <Text className={styles.amount}>{formatYen(totalIncome)}</Text>
        </Row>
      </Col>
    </Col>
  );
};
