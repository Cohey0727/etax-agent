import {
  FilingFigures,
  FilingType,
  filingIncomeBridgeRows,
  filingIncomeStatCards,
  filingTotalIncomeLabel,
} from "@etax/shared";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./IncomeSummary.css";

export interface IncomeSummaryProps {
  /** 帳簿と申告入力から求めた所得と税額（確定申告画面が計算したもの） */
  figures: FilingFigures;
  /** 申告の種類（白色は青色申告特別控除の行の表記を変える） */
  filingType: FilingType;
  /** 対象年の帳簿の取引件数（0 件なら取り込みを促す） */
  ledgerTransactionCount: number;
}

/**
 * 「収支」行の直下に置く収支の要約。収支（収入・支出・差引）を見直したら、
 * その結果である所得の数字を真下で確認して、そのまま「確定」にできるようにする。
 */
export const IncomeSummary = ({ figures, filingType, ledgerTransactionCount }: IncomeSummaryProps) => {
  const isWhite = filingType === "white";
  return (
    <Col gap="md">
      {ledgerTransactionCount === 0 ? (
        <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>
      ) : null}
      <div className={styles.statGrid}>
        {filingIncomeStatCards(figures, isWhite).map((card) => (
          <Card key={card.label}>
            <Col gap="none">
              <Text variant="statLabel">{card.label}</Text>
              <Text variant="statValue">{formatYen(card.amount)}</Text>
            </Col>
          </Card>
        ))}
      </div>
      <Col gap="sm">
        {filingIncomeBridgeRows(figures, isWhite).map((row) => (
          <Row key={row.label} align="center" justify="spaceBetween">
            <Text variant="muted">{row.label}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))}
        <Row align="center" justify="spaceBetween" className={styles.totalRow}>
          <Text>{filingTotalIncomeLabel(isWhite)}</Text>
          <Text className={styles.amount}>{formatYen(figures.totalIncome)}</Text>
        </Row>
      </Col>
    </Col>
  );
};
