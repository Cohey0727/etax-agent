import { ConsumptionComparisonRow, ConsumptionMethod } from "@etax/shared";
import { clsx } from "clsx";
import { Card, Col, Table, TableCell, TableHeaderCell, Text } from "@components/atoms";
import { formatNumber, formatYen } from "@utils";
import styles from "./ConsumptionTaxComparison.css";

export interface ConsumptionTaxComparisonProps {
  year: number;
  taxable: number;
  nontaxable: number;
  inputTax: number;
  results: readonly ConsumptionComparisonRow[];
}

const methodDetails = {
  standard: { label: "本則課税" },
  simplified: { label: "簡易課税（第5種・50%）" },
  special20: { label: "2割特例" },
} as const satisfies Record<ConsumptionMethod, { label: string }>;

export const ConsumptionTaxComparison = ({
  year,
  taxable,
  nontaxable,
  inputTax,
  results,
}: ConsumptionTaxComparisonProps) => {
  const maxPayable = Math.max(...results.map((r) => r.payable), 0);

  return (
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">消費税 — 3方式の比較（{year}年）</Text>
        <Text variant="muted">
          課税売上（税込）{formatYen(taxable)} ／ 非課税売上（住宅家賃）{formatYen(nontaxable)} ／
          仕入税額（経費からの概算）{formatYen(inputTax)}
        </Text>
        <Col gap="sm">
          {results.map((row) => (
            <div key={row.method} className={styles.barRow}>
              <span>{methodDetails[row.method].label}</span>
              <span className={styles.barTrack}>
                <span
                  className={clsx(styles.barFill, styles.barFillColor[row.method])}
                  style={{
                    width:
                      maxPayable > 0
                        ? `${Math.max(0, (row.payable / maxPayable) * 100)}%`
                        : "0%",
                  }}
                />
              </span>
              <span className={styles.barAmount}>
                {row.payable < 0 ? `還付 ${formatYen(-row.payable)}` : formatYen(row.payable)}
              </span>
            </div>
          ))}
        </Col>
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>方式</TableHeaderCell>
              <TableHeaderCell align="right">売上税額</TableHeaderCell>
              <TableHeaderCell align="right">仕入税額</TableHeaderCell>
              <TableHeaderCell align="right">納付税額</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.method}>
                <TableCell>{methodDetails[row.method].label}</TableCell>
                <TableCell align="right">{formatNumber(row.outputTax)}</TableCell>
                <TableCell align="right">{formatNumber(row.inputTax)}</TableCell>
                <TableCell align="right">
                  <strong>{formatNumber(row.payable)}</strong>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
        <Text variant="muted">
          ※ 仕入税額は経費からの概算です（正式には請求書・インボイスで確定）。
          2割特例・簡易課税の適用可否は基準期間の課税売上や届出状況など要件確認が必要です。
        </Text>
      </Col>
    </Card>
  );
};
