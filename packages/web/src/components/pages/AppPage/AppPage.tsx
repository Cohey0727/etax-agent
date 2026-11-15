import { sampleTransactions, Transaction } from "@etax/shared";
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconName } from "@components/atoms";
import { AgentChatPanel, AgentUiAction } from "@components/organisms/agent";
import {
  applyDeductionPatch,
  BreakdownEntry,
  DeductionPatch,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppTemplate } from "@components/templates";
import {
  AgentConnectionConfig,
  AppView,
  ChatMessage,
  FilingTab,
  SendKeyMode,
  ThemeMode,
  ViewPageProps,
} from "@types";
import {
  archiveChatSession,
  ChatSession,
  loadChatSessions,
  parsePath,
  pathForView,
} from "@utils";
import {
  fetchLedgerTransactions,
  ledgerRowToTransaction,
  replaceYearLedgerTransactions,
  transactionToLedgerInput,
} from "@utils/api";
import { DashboardPage } from "../DashboardPage";
import { FilingPage } from "../FilingPage";
import { ImportPage } from "../ImportPage";
import { LedgerPage } from "../LedgerPage";
import { ReceiptPage } from "../ReceiptPage";
import { SettingsPage } from "../SettingsPage";
import { TaxpayerPage } from "../TaxpayerPage";

// nav: サイドバーに出す画面。取込・領収書は帳簿の「追加」からの遷移専用
// （サイドバーには出さない）。設定は下部アクションバー左下のボタン専用。
// 修正は独立した画面を持たず、確定 → 差し戻し → 再確定の流れの中で
// 前回確定との差分として確定申告画面に出す。
const appViews = [
  { id: AppView.Dashboard, label: "ダッシュボード", icon: "grid", nav: true, Component: DashboardPage },
  { id: AppView.Import, label: "取引・CSV取込", icon: "import", nav: false, Component: ImportPage },
  { id: AppView.Receipt, label: "領収書から帳簿", icon: "receipt", nav: false, Component: ReceiptPage },
  { id: AppView.Ledger, label: "帳簿", icon: "book", nav: true, Component: LedgerPage },
  { id: AppView.Filing, label: "確定申告", icon: "fileCheck", nav: true, Component: FilingPage },
  { id: AppView.Taxpayer, label: "納税者情報", icon: "user", nav: true, Component: TaxpayerPage },
  { id: AppView.Settings, label: "設定", icon: "settings", nav: false, Component: SettingsPage },
] as const satisfies readonly {
  id: AppView;
  label: string;
  icon: IconName;
  nav: boolean;
  Component: ComponentType<ViewPageProps>;
}[];

// サイドバーで確定申告にぶら下げる子項目（タブへの直接遷移）。総合は親そのものなので出さない。
// 納税者情報は独立画面になったため、ここには含めない。
const FILING_NAV_CHILDREN: readonly { view: AppView; key: string; label: string }[] = [
  { view: AppView.Filing, key: "balance", label: "収支" },
  { view: AppView.Filing, key: "deductions", label: "控除" },
  { view: AppView.Filing, key: "consumption", label: "消費税" },
];

/** エージェント由来の控除パッチの内訳に、保存用の id を補う。 */
const withEntryIds = (patch: DeductionPatch): DeductionPatch => {
  if (!patch.entries) return patch;
  const entries: DeductionPatch["entries"] = {};
  for (const [key, list] of Object.entries(patch.entries)) {
    if (!list) continue;
    entries[key as keyof typeof entries] = list.map(
      (e, i): BreakdownEntry => ({
        id: e.id || `agent-${key}-${i}`,
        recipient: e.recipient ?? "",
        amount: typeof e.amount === "number" ? e.amount : 0,
      }),
    );
  }
  return { ...patch, entries };
};

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

const SEND_KEY_STORAGE_KEY = "etax-send-key";

const readStoredSendKeyMode = (): SendKeyMode => {
  try {
    if (localStorage.getItem(SEND_KEY_STORAGE_KEY) === "modEnter") return "modEnter";
  } catch {
    // 保存値が読めない環境では Enter 送信を既定にする
  }
  return "enter";
};

const YEAR_STORAGE_KEY = "etax-selected-year";

const readStoredYear = (): number => {
  try {
    const saved = Number(localStorage.getItem(YEAR_STORAGE_KEY));
    return Number.isInteger(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
};

/** 取引がまだ無いのに追加された年度（年度セレクタの「YYYY年度を追加」）。 */
const EXTRA_YEARS_STORAGE_KEY = "etax-extra-years";

const readExtraYears = (): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXTRA_YEARS_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (y): y is number => typeof y === "number" && Number.isInteger(y) && y >= 1900 && y <= 2100,
    );
  } catch {
    return [];
  }
};

const CONNECTION_STORAGE_KEY = "etax-agent-connection";

const readStoredAgentConnection = (): AgentConnectionConfig => {
  try {
    const raw = localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentConnectionConfig>;
      return {
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
        model: typeof parsed.model === "string" ? parsed.model : "",
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      };
    }
  } catch {
    // 読めない環境では未設定として扱う
  }
  return { baseUrl: "", model: "", apiKey: "" };
};

export const AppPage = () => {
  const sample = useMemo(() => sampleTransactions(), []);
  // 起動時のURL（/<画面>/<年度>）があれば、保存値より優先して初期状態にする。
  const initialRoute = useMemo(() => parsePath(window.location.pathname), []);
  const initialView =
    initialRoute && appViews.some((view) => view.id === initialRoute.view)
      ? initialRoute.view
      : AppView.Dashboard;
  const [transactions, setTransactions] = useState<Transaction[]>(sample);
  const [dataSource, setDataSource] = useState("サンプルデータ");
  const [activeView, setActiveView] = useState<AppView>(initialView);
  const [selectedYear, setSelectedYear] = useState<number>(
    () => initialRoute?.year ?? readStoredYear(),
  );
  // 確定申告画面のタブもURLと連動させる（リロード・戻る/進むで復元される）。
  const [filingTab, setFilingTab] = useState<FilingTab>(
    () => initialRoute?.filingTab ?? "overview",
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>(() => readStoredSendKeyMode());
  const [agentConnection, setAgentConnection] = useState<AgentConnectionConfig>(() =>
    readStoredAgentConnection(),
  );
  // エージェント会話の履歴。見出し横の履歴ボタンとパネルで状態を共有する。
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => loadChatSessions());
  // エージェントが設定・申告まわりを変更したときに、表示中の画面を読み直させる。
  const [viewRefreshKey, setViewRefreshKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<ChatSession | null>(null);
  // 会話クリアはパネル側の操作だが、ボタンはヘッダー（履歴の隣）に置くためハンドラを受け取る。
  const clearChatRef = useRef<(() => void) | null>(null);
  const [canClearChat, setCanClearChat] = useState(false);
  const handleClearReady = useCallback((handler: (() => void) | null) => {
    clearChatRef.current = handler;
    setCanClearChat(handler !== null);
  }, []);

  const [extraYears, setExtraYears] = useState<number[]>(() => readExtraYears());
  const years = useMemo(
    () => [...new Set([...transactions.map((t) => t.year), ...extraYears])].sort((a, b) => b - a),
    [transactions, extraYears],
  );
  const handleAddYear = useCallback(
    (nextYear: number) => {
      if (!extraYears.includes(nextYear)) {
        const next = [...extraYears, nextYear];
        setExtraYears(next);
        try {
          localStorage.setItem(EXTRA_YEARS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // 保存できなくても追加自体は有効にする
        }
      }
      // handleYearChange と同じ処理（宣言順の都合で直接書く）。
      setSelectedYear(nextYear);
      try {
        localStorage.setItem(YEAR_STORAGE_KEY, String(nextYear));
      } catch {
        // 保存できなくても切替自体は有効にする
      }
    },
    [extraYears],
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
  const handleSendKeyModeChange = (mode: SendKeyMode) => {
    setSendKeyMode(mode);
    try {
      localStorage.setItem(SEND_KEY_STORAGE_KEY, mode);
    } catch {
      // 保存できなくても切替自体は有効にする
    }
  };
  // 年度の切替は端末に保存し、次回も同じ年度から始める。
  const handleYearChange = useCallback((nextYear: number) => {
    setSelectedYear(nextYear);
    try {
      localStorage.setItem(YEAR_STORAGE_KEY, String(nextYear));
    } catch {
      // 保存できなくても切替自体は有効にする
    }
  }, []);

  // 画面・年度（と確定申告タブ）の状態をURLへ反映する。初回だけ履歴を汚さず置き換える。
  const firstUrlSyncRef = useRef(true);
  useEffect(() => {
    const path = pathForView(activeView, year, filingTab);
    if (window.location.pathname !== path) {
      if (firstUrlSyncRef.current) {
        window.history.replaceState(null, "", path);
      } else {
        window.history.pushState(null, "", path);
      }
    }
    firstUrlSyncRef.current = false;
  }, [activeView, year, filingTab]);

  // ブラウザの戻る/進むに合わせて画面・年度を復元する。
  useEffect(() => {
    const onPopState = () => {
      const route = parsePath(window.location.pathname);
      if (!route || !appViews.some((view) => view.id === route.view)) return;
      setActiveView(route.view);
      if (route.year) handleYearChange(route.year);
      if (route.filingTab) setFilingTab(route.filingTab);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handleYearChange]);

  // サイドバーのネスト項目（確定申告のタブ）から直接そのタブへ遷移する。
  const handleNavChildSelect = (view: AppView, key: string) => {
    if (view === AppView.Filing) setFilingTab(key as FilingTab);
    setActiveView(view);
  };
  const handleAgentConnectionChange = (config: AgentConnectionConfig) => {
    setAgentConnection(config);
    try {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // 保存できなくてもこのセッションでは有効にする
    }
  };
  const handleArchiveChat = (messages: ChatMessage[]) => {
    setChatSessions(archiveChatSession(messages));
  };
  const handleBackToChat = () => {
    setViewingSession(null);
    setHistoryOpen(false);
  };
  const handleUiAction = (action: AgentUiAction) => {
    if (action.type === "setYear") {
      handleYearChange(action.year);
    } else if (action.type === "applyDeductions") {
      // エージェントの控除変更を、画面側の保存値（localStorage）へ適用する。
      const patch = withEntryIds(action.patch);
      saveDeductionState(action.year, applyDeductionPatch(loadDeductionState(action.year), patch));
      setViewRefreshKey((v) => v + 1);
    } else if (action.type === "reloadView") {
      setViewRefreshKey((v) => v + 1);
    } else if (action.type === "reloadTransactions") {
      // エージェントが帳簿DBへ書き込んだ後は、帳簿の最新状態を読み直して反映する。
      void (async () => {
        const rows = await fetchLedgerTransactions();
        if (!rows) return;
        setTransactions(rows.map(ledgerRowToTransaction));
        setDataSource("帳簿");
      })();
    } else if (action.type === "setTheme") {
      handleThemeModeChange(action.mode);
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
      onYearChange={handleYearChange}
      onAddYear={handleAddYear}
      dataSource={dataSource}
      transactionCount={transactions.length}
      agentPanel={
        <AgentChatPanel
          transactions={transactions}
          onUiAction={handleUiAction}
          sendKeyMode={sendKeyMode}
          getDeductionsSnapshot={() => ({ year, state: loadDeductionState(year) })}
          agentConnection={agentConnection}
          sessions={chatSessions}
          historyOpen={historyOpen}
          viewing={viewingSession}
          onSelectSession={setViewingSession}
          onArchive={handleArchiveChat}
          onClearReady={handleClearReady}
        />
      }
      agentHeaderExtra={
        historyOpen || viewingSession ? (
          <Button variant="ghost" size="sm" onClick={handleBackToChat}>
            ← チャットに戻る
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={chatSessions.length === 0}
              disabledReason="履歴がありません"
              onClick={() => setHistoryOpen(true)}
            >
              履歴{chatSessions.length > 0 ? `（${chatSessions.length}）` : ""}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canClearChat}
              disabledReason="クリアできる会話がありません"
              onClick={() => clearChatRef.current?.()}
            >
              クリア
            </Button>
          </>
        )
      }
      onViewChange={setActiveView}
      navChildren={FILING_NAV_CHILDREN}
      activeNavChildKey={filingTab}
      onNavChildSelect={handleNavChildSelect}
    >
      <ActiveComponent
        key={viewRefreshKey}
        transactions={transactions}
        year={year}
        onUseTransactions={handleUseImported}
        onLoadSample={handleLoadSample}
        onSyncTransactions={handleSyncTransactions}
        onNavigate={setActiveView}
        themeMode={themeMode}
        onThemeModeChange={handleThemeModeChange}
        sendKeyMode={sendKeyMode}
        onSendKeyModeChange={handleSendKeyModeChange}
        agentConnection={agentConnection}
        onAgentConnectionChange={handleAgentConnectionChange}
        filingTab={filingTab}
        onFilingTabChange={setFilingTab}
      />
    </AppTemplate>
  );
};
