import { Card, Col, Text } from "@components/atoms";
import { TrialBalanceBs, TrialBalanceBsRow } from "@types";
import { formatYen } from "@utils";
import styles from "./TrialBalancePanel.css";

export interface BalanceSheetSectionProps {
  balanceSheet: TrialBalanceBs;
}

/**
 * 貸借対照表（試算表）。取引からは算出できないため、貸借対照表入力が
 * ある場合にだけ表示される。合計の算出はXTXの決算書（KOA210 4面）と
 * 同じで、貸借が一致しない場合はその旨と差額を表示する。
 */
export const BalanceSheetSection = ({ balanceSheet }: BalanceSheetSectionProps) => {
  const bs = balanceSheet;
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">貸借対照表</Text>
        <div className={styles.tableScroll}>
          <div className={`${styles.bsRow} ${styles.headRow}`}>
            <span>資産の部</span>
            <span className={styles.cell}>期首</span>
            <span className={styles.cell}>期末</span>
          </div>
          {bs.asset_rows.map((row) => (
            <BsRowLine key={row.key} row={row} />
          ))}
          <div className={styles.bsRow}>
            <span>事業主貸</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>{formatYen(bs.owner_loan)}</span>
          </div>
          <div className={`${styles.bsRow} ${styles.totalRow}`}>
            <span>資産合計</span>
            <span className={styles.cell}>{formatYen(bs.opening_assets)}</span>
            <span className={styles.cell}>{formatYen(bs.closing_assets)}</span>
          </div>
          <div className={`${styles.bsRow} ${styles.headRow}`}>
            <span>負債・資本の部</span>
            <span className={styles.cell}>期首</span>
            <span className={styles.cell}>期末</span>
          </div>
          {bs.liability_rows.map((row) => (
            <BsRowLine key={row.key} row={row} />
          ))}
          <div className={styles.bsRow}>
            <span>事業主借</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>{formatYen(bs.owner_borrowing)}</span>
          </div>
          <div className={styles.bsRow}>
            <span>元入金</span>
            <span className={styles.cell}>{formatYen(bs.capital)}</span>
            <span className={styles.cell}>{formatYen(bs.capital)}</span>
          </div>
          <div className={styles.bsRow}>
            <span>所得金額（青色申告特別控除前）</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>{formatYen(bs.income_before_blue)}</span>
          </div>
          <div className={`${styles.bsRow} ${styles.totalRow}`}>
            <span>負債・資本合計</span>
            <span className={styles.cell}>{formatYen(bs.opening_liabilities_capital)}</span>
            <span className={styles.cell}>{formatYen(bs.closing_liabilities_capital)}</span>
          </div>
        </div>
        <BalanceNote label="期首" balanced={bs.opening_balanced} diff={bs.opening_assets - bs.opening_liabilities_capital} />
        <BalanceNote label="期末" balanced={bs.closing_balanced} diff={bs.closing_assets - bs.closing_liabilities_capital} />
      </Col>
    </Card>
  );
};

const BsRowLine = ({ row }: { row: TrialBalanceBsRow }) => (
  <div className={styles.bsRow}>
    <span>{row.label}</span>
    <span className={styles.cell}>{formatYen(row.opening)}</span>
    <span className={styles.cell}>{formatYen(row.closing)}</span>
  </div>
);

const BalanceNote = ({ label, balanced, diff }: { label: string; balanced: boolean; diff: number }) =>
  balanced ? (
    <Text variant="caption">{label}の貸借は一致しています。</Text>
  ) : (
    <Text variant="caption">
      <span className={styles.amountNegative}>
        {label}の貸借が一致していません（差額 {formatYen(diff)}円）。
      </span>
    </Text>
  );
