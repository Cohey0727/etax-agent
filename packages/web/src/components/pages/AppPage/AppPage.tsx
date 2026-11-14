import { sampleTransactions, Transaction } from "@etax/shared";
import { ComponentType, useMemo, useState } from "react";
import { IconName } from "@components/atoms";
import { AgentChatPanel, AgentUiAction } from "@components/organisms/agent";
import { AppTemplate } from "@components/templates";
import { AppView, ViewPageProps } from "@types";
import { AmendPage } from "../AmendPage";
import { DashboardPage } from "../DashboardPage";
import { ImportPage } from "../ImportPage";

const appViews = [
  { id: AppView.Dashboard, label: "ダッシュボード", icon: "grid", Component: DashboardPage },
  { id: AppView.Import, label: "取引・CSV取込", icon: "import", Component: ImportPage },
  { id: AppView.Amend, label: "修正申告", icon: "amend", Component: AmendPage },
] as const satisfies readonly {
  id: AppView;
  label: string;
  icon: IconName;
  Component: ComponentType<ViewPageProps>;
}[];

export const AppPage = () => {
  const sample = useMemo(() => sampleTransactions(), []);
  const [transactions, setTransactions] = useState<Transaction[]>(sample);
  const [dataSource, setDataSource] = useState("サンプルデータ");
  const [activeView, setActiveView] = useState<AppView>(AppView.Dashboard);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [darkMode, setDarkMode] = useState<boolean>(
    () =>
      typeof document !== "undefined" && document.documentElement.dataset.theme === "dark",
  );

  const years = useMemo(
    () => [...new Set(transactions.map((t) => t.year))].sort((a, b) => b - a),
    [transactions],
  );
  // 選択中の年がデータに無い場合は、描画時点で最新の年に詰める
  const year = years.includes(selectedYear) ? selectedYear : (years[0] ?? new Date().getFullYear());

  const handleUseImported = (next: Transaction[]) => {
    setTransactions(next);
    setDataSource("取込CSV");
    setActiveView(AppView.Dashboard);
  };
  const handleLoadSample = () => {
    setTransactions(sample);
    setDataSource("サンプルデータ");
  };
  const handleToggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("etax-theme", next ? "dark" : "light");
    } catch {
      // 保存できなくても切替自体は有効にする
    }
  };
  const handleUiAction = (action: AgentUiAction) => {
    if (action.type === "setYear") {
      setSelectedYear(action.year);
    } else if (appViews.some((view) => view.id === action.view)) {
      setActiveView(action.view);
    }
  };

  const active = appViews.find((view) => view.id === activeView) ?? appViews[0];
  const ActiveComponent = active.Component;

  return (
    <AppTemplate
      views={appViews}
      activeView={activeView}
      years={years}
      selectedYear={year}
      onYearChange={setSelectedYear}
      dataSource={dataSource}
      transactionCount={transactions.length}
      darkMode={darkMode}
      onToggleDarkMode={handleToggleDarkMode}
      agentPanel={<AgentChatPanel transactions={transactions} onUiAction={handleUiAction} />}
      onViewChange={setActiveView}
    >
      <ActiveComponent
        transactions={transactions}
        year={year}
        onUseTransactions={handleUseImported}
        onLoadSample={handleLoadSample}
      />
    </AppTemplate>
  );
};
