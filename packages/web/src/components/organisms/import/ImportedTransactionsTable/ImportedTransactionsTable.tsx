import { IncomeType, Transaction } from "@etax/shared";
import { Card, Col, Table, TableCell, TableHeaderCell, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./ImportedTransactionsTable.css";

export interface ImportedTransactionsTableProps {
  transactions: Transaction[];
}

const incomeTypeLabels = {
  business: "事業",
  real_estate: "不動産",
  other: "その他",
} as const satisfies Record<IncomeType, string>;

export const ImportedTransactionsTable = ({ transactions }: ImportedTransactionsTableProps) => {
  return (
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">取込結果（先頭200件）</Text>
        <div className={styles.scroll}>
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>日付</TableHeaderCell>
                <TableHeaderCell>摘要</TableHeaderCell>
                <TableHeaderCell align="right">金額</TableHeaderCell>
                <TableHeaderCell>勘定科目</TableHeaderCell>
                <TableHeaderCell>所得区分</TableHeaderCell>
                <TableHeaderCell>口座</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 200).map((t, i) => (
                <tr key={i}>
                  <TableCell className={styles.dateCell}>{t.date}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell align="right" tone={t.amount < 0 ? "negative" : "default"}>
                    {formatYen(t.amount)}
                  </TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell>{incomeTypeLabels[t.income_type]}</TableCell>
                  <TableCell>{t.account}</TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Col>
    </Card>
  );
};
