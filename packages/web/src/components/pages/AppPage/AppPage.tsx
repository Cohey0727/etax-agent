import { sampleTransactions, Transaction } from "@etax/shared";
import { ComponentType, useEffect, useMemo, useState } from "react";
import { IconName } from "@components/atoms";
import { AgentChatPanel, AgentUiAction } from "@components/organisms/agent";
import { AppTemplate } from "@components/templates";
import { AppView, ThemeMode, ViewPageProps } from "@types";
import {
  fetchLedgerTransactions,
  ledgerRowToTransaction,
  replaceYearLedgerTransactions,
  transactionToLedgerInput,
} from "@utils/api";
import { AmendPage } from "../AmendPage";
import { DashboardPage } from "../DashboardPage";
import { FilingPage } from "../FilingPage";
import { ImportPage } from "../ImportPage";
import { LedgerPage } from "../LedgerPage";
import { ReceiptPage } from "../ReceiptPage";
import { SettingsPage } from "../SettingsPage";

// nav: サイドバーに出す画面。取込・領収書は帳簿の「追加」からの遷移専用、
// 修正申告は提出済みになった年だけ出る導線専用（サイドバーには出さない）。
const appViews = [
  { id: AppView.Dashboard, label: "ダッシュボード", icon: "grid", nav: true, Component: DashboardPage },
  { id: AppView.Import, label: "取引・CSV取込", icon: "import", nav: false, Component: ImportPage },
  { id: AppView.Receipt, label: "領収書から帳簿", icon: "receipt", nav: false, Component: ReceiptPage },
  { id: AppView.Amend, label: "修正申告", icon: "amend", nav: false, Component: AmendPage },
  { id: AppView.Ledger, label: "帳簿", icon: "book", nav: true, Component: LedgerPage },
  { id: AppView.Filing, label: "確定申告", icon: "fileCheck", nav: true, Component: FilingPage },
  { id: AppView.Settings, label: "設定", icon: "settings", nav: true, Component: SettingsPage },
] as const satisfies readonly {
  id: AppView;
  label: string;
  icon: IconName;
  nav: boolean;
  Component: ComponentType<ViewPageProps>;
}[];

const THEME_STORAGE_KEY = "etax-theme";

const readStoredThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // 保存値が読めない環境では端末設定に合わせる
  }
  return "system";
};

const applyThemeMode = (mode: ThemeMode) => {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};

export const AppPage = () => {
  const sample = useMemo(() => sampleTransactions(), []);
  const [transactions, setTransactions] = useState<Transaction[]>(sample);
  const [dataSource, setDataSource] = useState("サンプルデータ");
  const [activeView, setActiveView] = useState<AppView>(AppView.Dashboard);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());

  const years = useMemo(
    () => [...new Set(transactions.map((t) => t.year))].sort((a, b) => b - a),
    [transactions],
  );
  // 選択中の年がデータに無い場合は、描画時点で最新の年に詰める
  const year = years.includes(selectedYear) ? selectedYear : (years[0] ?? new Date().getFullYear());

  // 起動時に帳簿（DB）を読み、保存済みの取引があればそれを正として表示する。
  // 帳簿が未接続・空ならサンプルデータのまま。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchLedgerTransactions();
      if (cancelled || !rows || rows.length === 0) return;
      setTransactions(rows.map(ledgerRowToTransaction));
      setDataSource("帳簿");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUseImported = (next: Transaction[]) => {
    setTransactions(next);
    setDataSource("取込CSV");
    setActiveView(AppView.Dashboard);
    // 確定した内容は帳簿へも保存する（年ごとに置き換え。失敗しても画面は継続）。
    const yearsToSave = [...new Set(next.map((tx) => tx.year))];
    for (const saveYear of yearsToSave) {
      const inputs = next
        .filter((tx) => tx.year === saveYear)
        .map(transactionToLedgerInput);
      void replaceYearLedgerTransactions(saveYear, inputs).catch(() => {
        // 帳簿が未接続の環境ではメモリ上のみで動く
      });
    }
  };
  const handleSyncTransactions = (next: Transaction[]) => {
    setTransactions(next);
    setDataSource("帳簿");
  };
  const handleLoadSample = () => {
    setTransactions(sample);
    setDataSource("サンプルデータ");
  };
  const handleThemeModeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
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
      agentPanel={<AgentChatPanel transactions={transactions} onUiAction={handleUiAction} />}
      onViewChange={setActiveView}
    >
      <ActiveComponent
        transactions={transactions}
        year={year}
        onUseTransactions={handleUseImported}
        onLoadSample={handleLoadSample}
        onSyncTransactions={handleSyncTransactions}
        onNavigate={setActiveView}
        themeMode={themeMode}
        onThemeModeChange={handleThemeModeChange}
      />
    </AppTemplate>
  );
};
