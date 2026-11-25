import { IncomeType, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Card, Col, SkeletonBar, Text } from "@components/atoms";
import { loadDeductionState } from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppView, TrialBalanceResponse } from "@types";
import { fetchTrialBalance } from "@utils";
import { BalanceSheetSection } from "./BalanceSheetSection";
import { MonthlySection } from "./MonthlySection";
import { OtherSection } from "./OtherSection";
import { PlSection } from "./PlSection";

export interface TrialBalancePanelProps {
  transactions: Transaction[];
  year: number;
  onNavigate?: (view: AppView) => void;
}

/**
 * 残高試算表レポート（Issue #18）。帳簿の取引から、XTXの青色申告
 * 決算書と一致する損益計算書・月次推移・前年比較を表示する。
 * 集計はサーバー側の決定的な計算（POST /api/calc/trial-balance）に寄せ、
 * 申告種別は申告画面の設定（localStorage）を渡して決算書と揃える。
 * 貸借対照表は入力データの供給元がまだ無いため、APIから返った場合のみ
 * 表示する（現行のWebでは通常は出ない）。
 */
export const TrialBalancePanel = ({ transactions, year, onNavigate }: TrialBalancePanelProps) => {
  const [report, setReport] = useState<TrialBalanceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setFailed(false);
    const filing = loadDeductionState(year);
    fetchTrialBalance({
      transactions,
      year,
      filing_type: filing.filingType,
      real_estate_business_scale: filing.realEstateBusinessScale,
    })
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [transactions, year]);

  const hasTransactions = useMemo(
    () => transactions.some((t) => t.year === year),
    [transactions, year],
  );

  // 科目から帳簿へドリルダウンする。帳簿はマウント時にURLクエリから
  // 初期フィルターを読むため、遷移前にクエリを書き換えておく
  // （AppPage のURL同期はパスだけを見るのでクエリは保持される）。
  const handleDrillDown = (incomeType: IncomeType, categories: string[]) => {
    const params = new URLSearchParams();
    params.set("filters", "year,category,incomeType");
    params.set("year", String(year));
    for (const category of categories) params.append("cat", category);
    params.append("itype", incomeType);
    window.history.replaceState(null, "", `/ledger?${params.toString()}`);
    onNavigate?.(AppView.Ledger);
  };

  if (failed) {
    return (
      <Card>
        <Text variant="muted">試算表を取得できませんでした。時間をおいて再度開いてください。</Text>
      </Card>
    );
  }
  if (!report) return <TrialBalanceSkeleton />;
  if (!hasTransactions) {
    return (
      <Card>
        <Col gap="sm">
          <Text variant="statLabel">残高試算表</Text>
          <Text variant="muted">
            {year}年の取引はまだありません。帳簿に取引が入ると、ここに決算書と一致する試算表が表示されます。
          </Text>
        </Col>
      </Card>
    );
  }
  return (
    <Col gap="md">
      <PlSection
        title="事業所得（損益計算書）"
        year={year}
        incomeType="business"
        current={report.business}
        previous={report.previous.business}
        onDrillDown={handleDrillDown}
      />
      <PlSection
        title="不動産所得（損益計算書）"
        year={year}
        incomeType="real_estate"
        current={report.real_estate}
        previous={report.previous.real_estate}
        onDrillDown={handleDrillDown}
      />
      <OtherSection
        current={report.other}
        previous={report.previous.other}
        onDrillDown={handleDrillDown}
      />
      <MonthlySection year={year} current={report.monthly} previous={report.previous.monthly} />
      {report.balance_sheet ? <BalanceSheetSection balanceSheet={report.balance_sheet} /> : null}
    </Col>
  );
};

/** 読み込み中のスケルトン（試算表の表組みに似せた形）。 */
const TrialBalanceSkeleton = () => (
  <Col gap="md">
    {[0, 1].map((card) => (
      <Card key={card}>
        <Col gap="sm">
          <SkeletonBar width="30%" height={14} />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <SkeletonBar key={row} width="100%" height={12} />
          ))}
        </Col>
      </Card>
    ))}
  </Col>
);
