import { sampleTransactions, Transaction } from "@etax/shared";
import { ComponentType, useMemo, useState } from "react";
import { AppTemplate } from "@components/templates";
import { AppView, ViewPageProps } from "@types";
import { AgentPage } from "../AgentPage";
import { AmendPage } from "../AmendPage";
import { DashboardPage } from "../DashboardPage";
import { ImportPage } from "../ImportPage";

const appViews = [
  { id: AppView.Dashboard, label: "ダッシュボード", Component: DashboardPage },
  { id: AppView.Import, label: "取引・CSV取込", Component: ImportPage },
  { id: AppView.Amend, label: "修正申告", Component: AmendPage },
  { id: AppView.Agent, label: "エージェント", Component: AgentPage },
] as const satisfies readonly {
  id: AppView;
  label: string;
  Component: ComponentType<ViewPageProps>;
}[];

export const AppPage = () => {
  const sample = useMemo(() => sampleTransactions(), []);
  const [transactions, setTransactions] = useState<Transaction[]>(sample);
  const [dataSource, setDataSource] = useState("サンプルデータ");
  const [activeView, setActiveView] = useState<AppView>(AppView.Dashboard);

  const handleUseImported = (next: Transaction[]) => {
    setTransactions(next);
    setDataSource("取込CSV");
    setActiveView(AppView.Dashboard);
  };
  const handleLoadSample = () => {
    setTransactions(sample);
    setDataSource("サンプルデータ");
  };

  const active = appViews.find((view) => view.id === activeView) ?? appViews[0];
  const ActiveComponent = active.Component;

  return (
    <AppTemplate
      views={appViews}
      activeView={activeView}
      dataSource={dataSource}
      transactionCount={transactions.length}
      onViewChange={setActiveView}
    >
      <ActiveComponent
        transactions={transactions}
        onUseTransactions={handleUseImported}
        onLoadSample={handleLoadSample}
      />
    </AppTemplate>
  );
};
