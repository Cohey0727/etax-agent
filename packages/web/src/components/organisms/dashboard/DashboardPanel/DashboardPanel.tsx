import {
  aggregateIncome,
  blueDeduction,
  consumptionTax,
  ConsumptionMethod,
  estimateInputTax,
  filterYear,
  residentialRentTotal,
  taxableSalesFromBreakdown,
  Transaction,
} from "@etax/shared";
import { useMemo, useState } from "react";
import { Card, Col, Row, Select, Text } from "@components/atoms";
import { ConsumptionTaxComparison, ConsumptionTaxRow } from "../ConsumptionTaxComparison";
import { IncomeSummary } from "../IncomeSummary";

export interface DashboardPanelProps {
  transactions: Transaction[];
}

const methodOrder: readonly ConsumptionMethod[] = ["standard", "simplified", "special20"];

export const DashboardPanel = ({ transactions }: DashboardPanelProps) => {
  const years = useMemo(
    () => [...new Set(transactions.map((t) => t.year))].sort((a, b) => b - a),
    [transactions],
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    years[0] ?? new Date().getFullYear(),
  );
  // 選択中の年がデータに無い場合は、state を直さず描画時点で最新の年に詰める
  const year = years.includes(selectedYear) ? selectedYear : (years[0] ?? selectedYear);

  const tx = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const breakdown = useMemo(() => aggregateIncome(tx), [tx]);
  const blue = useMemo(
    () => blueDeduction(breakdown.realEstateIncome, breakdown.businessIncome),
    [breakdown],
  );
  const rent = useMemo(() => residentialRentTotal(tx), [tx]);
  const [taxable, nontaxable] = useMemo(
    () => taxableSalesFromBreakdown(breakdown, rent),
    [breakdown, rent],
  );
  const inputTax = useMemo(() => estimateInputTax(tx), [tx]);
  const results = useMemo<ConsumptionTaxRow[]>(
    () =>
      methodOrder.map((method) => {
        const result = consumptionTax({
          taxableSalesIncl: taxable,
          nontaxableSalesIncl: nontaxable,
          inputTax,
          method,
        });
        return {
          method,
          outputTax: result.outputTax,
          inputTax: result.inputTax,
          payable: result.payable,
        };
      }),
    [taxable, nontaxable, inputTax],
  );

  return (
    <Col gap="md">
      <Card>
        <Row gap="md" align="center" wrap>
          <label>
            対象年{" "}
            <Select value={year} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </Select>
          </label>
          <Text variant="muted">
            取引 {tx.length} 件（全 {transactions.length} 件）／ 税込経理
          </Text>
        </Row>
      </Card>
      <IncomeSummary breakdown={breakdown} blue={blue} />
      <ConsumptionTaxComparison
        year={year}
        taxable={taxable}
        nontaxable={nontaxable}
        inputTax={inputTax}
        results={results}
      />
    </Col>
  );
};
