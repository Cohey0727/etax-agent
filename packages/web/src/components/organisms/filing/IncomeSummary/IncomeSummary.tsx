import {
  BlueDeductionOptions,
  MiscIncomeInput,
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
  /** 雑所得（その他）。帳簿に載らない所得として合計に含める。 */
  miscIncome?: MiscIncomeInput;
}

/**
 * 「収支」行の直下に置く収支の要約。収支（収入・支出・差引）を見直したら、
 * その結果である所得の数字を真下で確認して、そのまま「確定」にできるようにする。
 */
export const IncomeSummary = ({ transactions, year, filingOptions, miscIncome }: IncomeSummaryProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, filingOptions?.filingType, filingOptions?.realEstateBusinessScale],
  );
  // 収入・支出の見出しは事業＋不動産だけを数える（収支タブの
  // BalanceSummary と同じ）。口座の生の出入り（チャージ・振替・投資・
  // カード決済などの「その他」区分）まで合計すると実態とかけ離れる。
  const incomeTotal = figures.business_revenue + figures.real_estate_revenue;
  const expenseTotal = figures.business_expenses + figures.real_estate_expenses;

  if (yearTransactions.length === 0) {
    return (
      <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>
    );
  }

  const isWhite = filingOptions?.filingType === "white";
  const suffix = isWhite ? "" : "（青色控除後）";
  const misc = miscIncome?.income ?? 0;
  const totalIncome = figures._detail.business_income + figures._detail.real_estate_income + misc;
  const statCards: readonly { label: string; value: string }[] = [
    { label: "収入合計", value: formatYen(incomeTotal) },
    { label: "支出合計", value: formatYen(expenseTotal) },
    { label: "収支（差引）", value: formatYen(incomeTotal - expenseTotal) },
    { label: `所得合計${suffix}`, value: formatYen(totalIncome) },
  ];
  const bridgeRows: readonly { label: string; amount: number }[] = [
    { label: "事業の差引", amount: figures.business_revenue - figures.business_expenses },
    { label: "不動産の差引", amount: figures.real_estate_revenue - figures.real_estate_expenses },
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: -figures.blue_deduction,
    },
    ...(misc > 0 ? [{ label: "雑所得", amount: misc }] : []),
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
        {bridgeRows.map((row) => (
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
