import { sampleTransactions, Transaction } from "@etax/shared";
import { ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconName } from "@components/atoms";
import { AgentChatPanel, AgentUiAction } from "@components/organisms/agent";
import { AppTemplate } from "@components/templates";
import {
  AgentConnectionConfig,
  AppView,
  ChatMessage,
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
import { AmendPage } from "../AmendPage";
import { DashboardPage } from "../DashboardPage";
import { FilingPage } from "../FilingPage";
import { ImportPage } from "../ImportPage";
import { LedgerPage } from "../LedgerPage";
import { ReceiptPage } from "../ReceiptPage";
import { SettingsPage } from "../SettingsPage";

// nav: サイドバーに出す画面。取込・領収書は帳簿の「追加」からの遷移専用、
// 修正申告は提出済みになった年だけ出る導線専用（サイドバーには出さない）。
// 設定は下部アクションバー左下のボタン専用。
const appViews = [
  { id: AppView.Dashboard, label: "ダッシュボード", icon: "grid", nav: true, Component: DashboardPage },
  { id: AppView.Import, label: "取引・CSV取込", icon: "import", nav: false, Component: ImportPage },
  { id: AppView.Receipt, label: "領収書から帳簿", icon: "receipt", nav: false, Component: ReceiptPage },
  { id: AppView.Amend, label: "修正申告", icon: "amend", nav: false, Component: AmendPage },
  { id: AppView.Ledger, label: "帳簿", icon: "book", nav: true, Component: LedgerPage },
  { id: AppView.Filing, label: "確定申告", icon: "fileCheck", nav: true, Component: FilingPage },
  { id: AppView.Settings, label: "設定", icon: "settings", nav: false, Component: SettingsPage },
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>(() => readStoredSendKeyMode());
  const [agentConnection, setAgentConnection] = useState<AgentConnectionConfig>(() =>
    readStoredAgentConnection(),
  );
  // エージェント会話の履歴。見出し横の履歴ボタンとパネルで状態を共有する。
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => loadChatSessions());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<ChatSession | null>(null);

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

  // 画面・年度の状態をURL（/<画面>/<年度>）へ反映する。初回だけ履歴を汚さず置き換える。
  const firstUrlSyncRef = useRef(true);
  useEffect(() => {
    const path = pathForView(activeView, year);
    if (window.location.pathname !== path) {
      if (firstUrlSyncRef.current) {
        window.history.replaceState(null, "", path);
      } else {
        window.history.pushState(null, "", path);
      }
    }
    firstUrlSyncRef.current = false;
  }, [activeView, year]);

  // ブラウザの戻る/進むに合わせて画面・年度を復元する。
  useEffect(() => {
    const onPopState = () => {
      const route = parsePath(window.location.pathname);
      if (!route || !appViews.some((view) => view.id === route.view)) return;
      setActiveView(route.view);
      if (route.year) handleYearChange(route.year);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handleYearChange]);

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
      dataSource={dataSource}
      transactionCount={transactions.length}
      agentPanel={
        <AgentChatPanel
          transactions={transactions}
          onUiAction={handleUiAction}
          sendKeyMode={sendKeyMode}
          agentConnection={agentConnection}
          sessions={chatSessions}
          historyOpen={historyOpen}
          viewing={viewingSession}
          onSelectSession={setViewingSession}
          onArchive={handleArchiveChat}
        />
      }
      agentHeaderExtra={
        historyOpen || viewingSession ? (
          <Button variant="ghost" size="sm" onClick={handleBackToChat}>
            ← チャットに戻る
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={chatSessions.length === 0}
            onClick={() => setHistoryOpen(true)}
          >
            履歴{chatSessions.length > 0 ? `（${chatSessions.length}）` : ""}
          </Button>
        )
      }
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
        sendKeyMode={sendKeyMode}
        onSendKeyModeChange={handleSendKeyModeChange}
        agentConnection={agentConnection}
        onAgentConnectionChange={handleAgentConnectionChange}
      />
    </AppTemplate>
  );
};
