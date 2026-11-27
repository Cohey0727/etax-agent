import { Card, Col, Text } from "@components/atoms";
import {
  BalanceRecords,
  BalanceSheetPanel,
  BalanceSummary,
  FilingStatusToggle,
  MonthlyBalance,
} from "@components/organisms/filing";
import { FilingTabProps } from "../FilingTabProps";

/** 確定申告画面の「収支」タブ。帳簿の収支と所得の内訳、月別・取引・貸借対照表を並べる。 */
export const FilingBalanceTab = ({
  year,
  yearTransactions,
  deduction,
  figures,
  previousIncomeBeforeBlue,
  filingStatus,
  onToggleStatus,
  onOpenLedger,
}: FilingTabProps) => {
  const state = deduction.state;
  return (
    <>
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">収支</Text>
          <BalanceSummary
            transactions={yearTransactions}
            figures={figures}
            filingType={state.filingType}
            onOpenUnclassified={() => onOpenLedger("unclassified")}
          />
          <FilingStatusToggle
            statusKey="confirmed"
            label="収支"
            description="収支の金額・科目・区分に誤りがないか見直したら、ここで確定できます（総合・ダッシュボードと共有）。"
            filingStatus={filingStatus}
            onToggle={onToggleStatus}
          />
        </Col>
      </Card>
      <MonthlyBalance transactions={yearTransactions} />
      <BalanceRecords key={year} transactions={yearTransactions} />
      <BalanceSheetPanel
        year={year}
        balanceSheet={state.balanceSheet}
        incomeBeforeBlue={figures.corrected._detail.business_income_before_deduction}
        previousIncomeBeforeBlue={previousIncomeBeforeBlue}
        filingType={state.filingType}
        onChange={(next) => deduction.update({ balanceSheet: next })}
      />
    </>
  );
};
