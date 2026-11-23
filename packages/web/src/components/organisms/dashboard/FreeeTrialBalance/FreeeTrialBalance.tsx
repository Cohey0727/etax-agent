import { useEffect, useState } from "react";
import { Card, Col, Table, TableCell, TableHeaderCell, Text } from "@components/atoms";
import { FreeeTrialBalance as FreeeTrialBalanceData } from "@types";
import { fetchFreeeTrialBalance, formatYen } from "@utils";
import styles from "./FreeeTrialBalance.css";

export interface FreeeTrialBalanceProps {
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

/**
 * 損益計算書（実績）の表示。サーバーに取り込み済みデータが無い場合は
 * 何も表示しない（サンプル集計の画面を邪魔しないため）。
 */
export const FreeeTrialBalance = ({ year }: FreeeTrialBalanceProps) => {
  const [data, setData] = useState<FreeeTrialBalanceData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFreeeTrialBalance().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearData = data?.years.find((y) => y.year === year);
  if (!data || !yearData) return null;

  return (
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">損益計算書（実績）— {year}年</Text>
        <Text variant="muted">
          取り込み済みの実際の金額です（税込経理）。上の集計（サンプル／取込CSV）とは別の数字です。
        </Text>
        <div className={styles.scroll}>
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>勘定科目</TableHeaderCell>
                <TableHeaderCell>区分</TableHeaderCell>
                <TableHeaderCell align="right">借方</TableHeaderCell>
                <TableHeaderCell align="right">貸方</TableHeaderCell>
                <TableHeaderCell align="right">残高</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {yearData.accounts.map((account) => (
                <tr key={account.name}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{account.category}</TableCell>
                  <TableCell className={styles.numeric}>{formatYen(account.debit)}</TableCell>
                  <TableCell className={styles.numeric}>{formatYen(account.credit)}</TableCell>
                  <TableCell className={styles.numeric}>{formatYen(account.balance)}</TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Col>
    </Card>
  );
};
