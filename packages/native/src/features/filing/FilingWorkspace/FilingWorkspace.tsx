import {
  AgricultureInput,
  BlueDeductionOptions,
  BreakdownEntriesKey,
  BreakdownEntry,
  DeductionInputs,
  DeductionState,
  ExpandedIncomeInput,
  MiscIncomeInput,
  SalaryIncomeInput,
  TAX_PARAMETERS,
  TaxCreditInputs,
  XtxBalanceSheetInput,
  applyBreakdownEntries,
  buildSnapshotFigures,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  computeManualIncomes,
  filterYear,
  resolveTaxCreditInputs,
} from "@etax/shared";
import { useRouter } from "expo-router";
import { ReactNode, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Card, SkeletonCard, Tabs } from "@/components";
import { createFilingSnapshot } from "@/api";
import { useAppState } from "@/state/AppContext";
import { space } from "@/theme";
import { filingInputsStore } from "../deductionState";
import { AgriculturePanel } from "../AgriculturePanel";
import { BalanceRecords } from "../BalanceRecords";
import { BalanceSheetPanel } from "../BalanceSheetPanel";
import { BalanceSummary } from "../BalanceSummary";
import { ConfirmComparePanel } from "../ConfirmComparePanel";
import { ConsumptionTaxPanel } from "../ConsumptionTaxPanel";
import { DeductionPanel } from "../DeductionPanel";
import { ExpandedIncomePanel } from "../ExpandedIncomePanel";
import { FilingPanel, FilingSection } from "../FilingPanel";
import { FilingStatusToggle } from "../FilingStatusToggle";
import { MiscIncomePanel } from "../MiscIncomePanel";
import { MonthlyBalance } from "../MonthlyBalance";
import { SalaryPanel } from "../SalaryPanel";
import { LoadFailedNotice, SectionHead } from "../fields";
import { SubmissionRecordPanel } from "../SubmissionRecordPanel";
import { TaxCreditPanel } from "../TaxCreditPanel";
import { TaxpayerPanel } from "../TaxpayerPanel";
import { useFilingSnapshots } from "../useFilingSnapshots";
import { useYearInput } from "../useYearInput";

export type FilingTab = "overview" | "balance" | "deductions" | "consumption";

/** タブの並び。総合が起点で、収支・控除・消費税はそれぞれ独立した作業場。納税者情報は独立画面。 */
const FILING_TABS: readonly { id: FilingTab; label: string }[] = [
  { id: "overview", label: "総合" },
  { id: "balance", label: "収支" },
  { id: "deductions", label: "控除" },
  { id: "consumption", label: "消費税" },
];

/**
 * 確定申告の作業領域。申告入力（年度別）は納税者情報画面・エージェントと
 * 同じストアの値を読み書きする。サーバーの値を読み込むまでは入力欄を出さず、
 * 取得できなかったときは再読み込みだけを出す（空の入力から保存すると、
 * サーバーの値を全体置換で消してしまうため）。
 */
export function FilingWorkspace({ initialTab = "overview" }: { initialTab?: FilingTab }) {
  const { year } = useAppState();
  const { entry, update, reload } = useYearInput(filingInputsStore, year);
  // 所得税の計算は年分ごとの税務パラメータが無いと行えない（無い年分で計算すると例外になる）
  if (!(year in TAX_PARAMETERS)) {
    return (
      <Card>
        <AppText size="sm" tone="muted">
          {year}年分は所得税の計算に未対応です（対応: {Object.keys(TAX_PARAMETERS).join("・")}
          年分）。年度を切り替えてください。
        </AppText>
      </Card>
    );
  }
  if (entry.status === "loading") {
    return (
      <View style={styles.wrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (entry.status === "failed") {
    return (
      <Card>
        <LoadFailedNotice message="申告入力を取得できませんでした。" onRetry={reload} />
      </Card>
    );
  }
  return (
    <FilingWorkspaceContent initialTab={initialTab} deductionState={entry.value} update={update} />
  );
}

interface FilingWorkspaceContentProps {
  initialTab: FilingTab;
  deductionState: DeductionState;
  update: (change: (current: DeductionState) => DeductionState) => void;
}

/**
 * 控除入力の状態を使う作業領域の本体。
 * 「控除・計算」を確定すると計算結果がスナップショットとして控えられ、
 * 差し戻して再確定するときに前回確定との比較に使う。
 */
function FilingWorkspaceContent({ initialTab, deductionState, update }: FilingWorkspaceContentProps) {
  const router = useRouter();
  const { year, transactions } = useAppState();

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const [tab, setTab] = useState<FilingTab>(initialTab);

  const filingOptions: BlueDeductionOptions = {
    filingType: deductionState.filingType,
    realEstateBusinessScale: deductionState.realEstateBusinessScale,
  };
  // 申告数値の計算には農業所得の入力も渡す（青色申告特別控除の配分と
  // 農業所得の算入のため）。filingOptions を受ける子コンポーネントには
  // 従来どおり青色控除の区分だけを渡す。
  const figuresOptions = { ...filingOptions, agriculture: deductionState.agriculture };
  const computed = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, figuresOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTransactions, year, deductionState.filingType, deductionState.realEstateBusinessScale, deductionState.agriculture],
  );
  // 前年の事業所得（青色申告特別控除前）。貸借対照表の繰越で元入金を
  // 計算するために使う（申告種別は当年の設定で近似する提案値）。
  const previousComputed = useMemo(
    () => computeCorrectedFigures(filterYear(transactions, year - 1), year - 1, figuresOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, year, deductionState.filingType, deductionState.realEstateBusinessScale, deductionState.agriculture],
  );

  const updateDeductions = (next: DeductionInputs) => update((s) => ({ ...s, deductions: next }));
  const updateTaxCredits = (next: TaxCreditInputs) => update((s) => ({ ...s, taxCredits: next }));
  const updateMiscIncome = (next: MiscIncomeInput) => update((s) => ({ ...s, miscIncome: next }));
  const updateSalaryIncome = (next: SalaryIncomeInput) =>
    update((s) => ({ ...s, salaryIncome: next }));
  const updateExpandedIncome = (next: ExpandedIncomeInput) =>
    update((s) => ({ ...s, expandedIncome: next }));
  const updateAgriculture = (next: AgricultureInput) => update((s) => ({ ...s, agriculture: next }));
  const updateBalanceSheet = (next: XtxBalanceSheetInput | null) =>
    update((s) => ({ ...s, balanceSheet: next }));
  const updateBreakdownEntries = (key: BreakdownEntriesKey, entries: BreakdownEntry[]) =>
    update((s) => applyBreakdownEntries(s, key, entries));

  const manualIncomes = computeManualIncomes(
    year,
    deductionState.salaryIncome,
    deductionState.miscIncome,
    computed._detail.business_income +
      computed._detail.real_estate_income +
      computed._detail.agriculture_income,
  );
  // 拡張所得（配当・一時・株式等譲渡）の内訳。総合課税分は合計所得へ加算し、
  // 申告分離分は分離課税として計算する。配当控除の対象額は配当の内訳から
  // 導出した額を優先する（税額控除パネルの手入力との二重適用を防ぐ）。
  const expandedBreakdown = useMemo(
    () => computeExpandedIncomes(deductionState.expandedIncome),
    [deductionState.expandedIncome],
  );
  const totalIncome =
    computed._detail.business_income +
    computed._detail.real_estate_income +
    computed._detail.agriculture_income +
    manualIncomes.total +
    expandedBreakdown.comprehensiveAddition;
  const taxResult = useMemo(
    () =>
      computeIncomeTax({
        year,
        totalIncome,
        deductions: deductionState.deductions,
        taxCredits: resolveTaxCreditInputs(deductionState.taxCredits, expandedBreakdown),
        separateTaxation: {
          stockIncome: expandedBreakdown.separateStockIncome,
          dividendIncome: expandedBreakdown.separateDividendIncome,
        },
      }),
    [year, totalIncome, deductionState, expandedBreakdown],
  );

  // 確定スナップショット（前回確定との比較用）。確定は総合タブと控除タブの
  // どちらからでも行えるため、保存処理はここに寄せて両方から使う。
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const currentFigures = useMemo(
    () =>
      buildSnapshotFigures(
        transactions,
        year,
        figuresOptions,
        deductionState.miscIncome,
        taxResult,
        deductionState.salaryIncome,
      ),
    [transactions, year, figuresOptions, deductionState.miscIncome, taxResult, deductionState.salaryIncome],
  );
  const handleConfirmCalculation = async () => {
    if (!currentFigures) return;
    await createFilingSnapshot(year, currentFigures);
    await refreshSnapshots();
  };

  // 総合タブのセクションリンク。納税者情報だけはタブではなく独立画面へ遷移する。
  const openSection = (section: FilingSection) => {
    if (section === "taxpayer") {
      router.navigate("/taxpayer");
    } else {
      setTab(section);
    }
  };

  const tabContent: Record<FilingTab, ReactNode> = {
    overview: (
      <>
        <FilingPanel
          transactions={transactions}
          year={year}
          taxResult={taxResult}
          filingOptions={filingOptions}
          miscIncome={deductionState.miscIncome}
          salaryIncome={deductionState.salaryIncome}
          onOpenSection={openSection}
        />
        <TaxpayerPanel
          year={year}
          transactions={yearTransactions}
          deductions={deductionState.deductions}
          taxCredits={deductionState.taxCredits}
          miscIncome={deductionState.miscIncome}
          salaryIncome={deductionState.salaryIncome}
          expandedIncome={deductionState.expandedIncome}
          agriculture={deductionState.agriculture}
          filingType={deductionState.filingType}
          realEstateBusinessScale={deductionState.realEstateBusinessScale}
          balanceSheet={deductionState.balanceSheet}
          originalIncomeTax={null}
          onOpenSection={openSection}
        />
        <SubmissionRecordPanel year={year} kind="income" />
      </>
    ),
    balance: (
      <>
        <Card>
          <View style={styles.balanceCard}>
            <SectionHead title="収支" />
            <BalanceSummary
              transactions={transactions}
              year={year}
              filingOptions={filingOptions}
              miscIncome={deductionState.miscIncome}
              salaryIncome={deductionState.salaryIncome}
            />
            <FilingStatusToggle
              bare
              year={year}
              statusKey="confirmed"
              label="収支"
              description="収支の金額・科目・区分に誤りがないか見直したら、ここで確定できます（総合・ダッシュボードと共有）。"
            />
          </View>
        </Card>
        <MonthlyBalance transactions={yearTransactions} />
        <BalanceRecords key={year} transactions={yearTransactions} />
        <BalanceSheetPanel
          year={year}
          balanceSheet={deductionState.balanceSheet}
          incomeBeforeBlue={computed._detail.business_income_before_deduction}
          previousIncomeBeforeBlue={previousComputed._detail.business_income_before_deduction}
          filingType={deductionState.filingType}
          onChange={updateBalanceSheet}
        />
      </>
    ),
    deductions: (
      <>
        <SalaryPanel
          year={year}
          salaryIncome={deductionState.salaryIncome}
          onChange={updateSalaryIncome}
        />
        <MiscIncomePanel miscIncome={deductionState.miscIncome} onChange={updateMiscIncome} />
        <ExpandedIncomePanel
          expandedIncome={deductionState.expandedIncome}
          breakdown={expandedBreakdown}
          taxResult={taxResult}
          onChange={updateExpandedIncome}
        />
        <AgriculturePanel
          agriculture={deductionState.agriculture}
          filingType={deductionState.filingType}
          onChange={updateAgriculture}
        />
        <DeductionPanel
          year={year}
          deductions={deductionState.deductions}
          breakdown={taxResult.deductions}
          onChange={updateDeductions}
          breakdownEntries={{
            donations: deductionState.donationEntries,
            socialInsurance: deductionState.socialInsuranceEntries,
            mutualAid: deductionState.mutualAidEntries,
            medical: deductionState.medicalEntries,
          }}
          onBreakdownEntriesChange={updateBreakdownEntries}
        />
        <TaxCreditPanel
          taxCredits={deductionState.taxCredits}
          result={taxResult}
          dividendCreditDerived={expandedBreakdown.dividendDeclared}
          onChange={updateTaxCredits}
        />
        <ConfirmComparePanel year={year} snapshots={snapshots} currentFigures={currentFigures} />
        <FilingStatusToggle
          year={year}
          statusKey="calculated"
          label="控除・計算"
          description="所得控除・税額控除の入力が終わったら、ここで確定できます（総合・ダッシュボードと共有）。確定すると計算結果が控えられ、再確定のときに前回確定との差分が出ます。"
          onConfirm={handleConfirmCalculation}
        />
      </>
    ),
    consumption: (
      <>
        <ConsumptionTaxPanel transactions={transactions} year={year} />
        <SubmissionRecordPanel year={year} kind="consumption" />
      </>
    ),
  };

  return (
    <View style={styles.wrap}>
      <AppText size="sm" tone="muted">
        {year}年分の確定申告です。タブはそれぞれ独立した作業場で、順番は問いません。
      </AppText>
      <Tabs items={FILING_TABS} activeId={tab} onChange={setTab} />
      {tabContent[tab]}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  balanceCard: { gap: space.md },
});
