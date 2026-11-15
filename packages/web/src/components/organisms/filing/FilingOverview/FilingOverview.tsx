import {
  IncomeTaxResult,
  Transaction,
  computeCorrectedFigures,
  filterYear,
} from "@etax/shared";
import { useMemo } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./FilingOverview.css";

export interface FilingOverviewProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 控除タブと同じ入力で計算した所得税の結果 */
  taxResult: IncomeTaxResult;
}

/**
 * 総合タブで申告の概要（所得と税額の要約）を確認するカード。
 * 詳細な見直しは帳簿タブ・控除タブで行い、ここは数字の全体像だけを出す。
 */
export const FilingOverview = ({ transactions, year, taxResult }: FilingOverviewProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year),
    [yearTransactions, year],
  );

  if (yearTransactions.length === 0) {
    return (
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">概要</Text>
          <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>
        </Col>
      </Card>
    );
  }

  const totalIncome = figures._detail.business_income + figures._detail.real_estate_income;
  const statCards: readonly { label: string; value: string }[] = [
    { label: "事業所得（青色控除後）", value: formatYen(figures._detail.business_income) },
    { label: "不動産所得（青色控除後）", value: formatYen(figures._detail.real_estate_income) },
    { label: "所得合計", value: formatYen(totalIncome) },
    { label: "所得税額（確定税額）", value: formatYen(taxResult.finalTax) },
  ];
  const incomeRows: readonly { label: string; amount: number }[] = [
    { label: "事業収入", amount: figures.business_revenue },
    { label: "事業経費", amount: figures.business_expenses },
    { label: "不動産収入", amount: figures.real_estate_revenue },
    { label: "不動産経費", amount: figures.real_estate_expenses },
    { label: "青色申告特別控除", amount: figures.blue_deduction },
  ];
  const taxRows: readonly { label: string; amount: number }[] = [
    { label: "所得控除", amount: taxResult.deductionsTotal },
    { label: "課税所得", amount: taxResult.taxableIncome },
    { label: "所得税額（税額控除前）", amount: taxResult.incomeTaxBase },
    { label: "税額控除", amount: taxResult.taxCreditsTotal },
    { label: "復興特別所得税", amount: taxResult.reconstructionTax },
  ];

  return (
    <Card>
      <Col gap="md">
        <Text variant="sectionTitle">概要</Text>
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
            <Text>所得合計（青色控除後）</Text>
            <Text className={styles.amount}>{formatYen(totalIncome)}</Text>
          </Row>
        </Col>
        <Col gap="sm">
          {taxRows.map((row) => (
            <Row key={row.label} align="center" justify="spaceBetween">
              <Text variant="muted">{row.label}</Text>
              <Text className={styles.amount}>{formatYen(row.amount)}</Text>
            </Row>
          ))}
          <Row align="center" justify="spaceBetween" className={styles.totalRow}>
            <Text>所得税額（確定税額）</Text>
            <Text className={styles.amount}>{formatYen(taxResult.finalTax)}</Text>
          </Row>
        </Col>
        <Text variant="muted">
          源泉徴収税額・予定納税額との精算（申告納税額）は提出パネルで確認します。
        </Text>
      </Col>
    </Card>
  );
};
