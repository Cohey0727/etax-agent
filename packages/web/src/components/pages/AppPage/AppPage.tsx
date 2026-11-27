import { applyDeductionPatch, sampleTransactions, Transaction } from "@etax/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@components/atoms";
import { PageSkeleton, TableSkeleton } from "@components/molecules";
import { DashboardSkeleton } from "@components/organisms/dashboard";
import { AgentChatPanel, AgentUiAction } from "@components/organisms/agent";
import {
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
} from "@types";
import {
  archiveChatSession,
  ChatSession,
  loadAgentConnection,
  loadChatSessions,
  parsePath,
  pathForView,
  saveAgentConnection,
} from "@utils";
import { LoginPage } from "../LoginPage";
import { withEntryIds } from "./appPageHelpers";
import {
  applyThemeMode,
  followSystemTheme,
  readStoredSendKeyMode,
  readStoredThemeMode,
  SEND_KEY_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "./appPageStorage";
import { appViews, filingNavChildren } from "./appViews";
import { useAuthGate } from "./useAuthGate";
import { useLedgerSync } from "./useLedgerSync";
import { useYearSelection } from "./useYearSelection";

export const AppPage = () => {
  const sample = useMemo(() => sampleTransactions(), []);
  // エージェント会話の履歴。見出し横の履歴ボタンとパネルで状態を共有する。
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => loadChatSessions());
  // 認証ゲート: 設定（必須かどうか）とログイン状態を確認するまで待つ。
  // 必須でないローカル運用ではログインせずに使える。
  // 確認が終わったら、そのアカウントの端末保存（会話履歴・外部接続・年度）を読み直す。
  const { authConfig, authUser, authChecked, authQueryRef, refreshAuth, loginRequired } =
    useAuthGate(() => {
      setChatSessions(loadChatSessions());
      setAgentConnection(loadAgentConnection());
      reloadStoredYears();
    });
  // 起動時のURL（/<画面>/<年度>）があれば、保存値より優先して初期状態にする。
  const initialRoute = useMemo(() => parsePath(window.location.pathname), []);
  const initialView =
    initialRoute && appViews.some((view) => view.id === initialRoute.view)
      ? initialRoute.view
      : AppView.Dashboard;
  const [activeView, setActiveView] = useState<AppView>(initialView);
  // 帳簿（DB）と画面の取引状態の同期。読み込み中はスケルトンを出し、
  // 帳簿が未接続・空なら空のままにする（サンプルデータは取込画面で
  // 明示的に読み込む場合だけ使う）。
  const {
    transactions,
    dataSource,
    ledgerLoading,
    handleUseImported,
    handleRegisterTransaction,
    handleUseCsvImported,
    handleSyncTransactions,
    handleLoadSample,
    reloadTransactions,
  } = useLedgerSync({
    authChecked,
    authUserId: authUser?.id ?? null,
    sample,
    setActiveView,
  });
  const { years, year, handleYearChange, handleAddYear, reloadStoredYears } = useYearSelection(
    transactions,
    initialRoute?.year ?? undefined,
  );
  // 確定申告画面のタブもURLと連動させる（リロード・戻る/進むで復元される）。
  const [filingTab, setFilingTab] = useState<FilingTab>(
    () => initialRoute?.filingTab ?? "overview",
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [sendKeyMode, setSendKeyMode] = useState<SendKeyMode>(() => readStoredSendKeyMode());
  const [agentConnection, setAgentConnection] = useState<AgentConnectionConfig>(() =>
    loadAgentConnection(),
  );
  // エージェントが控除入力を変更したときに、表示中の画面を読み直させる。
  const [viewRefreshKey, setViewRefreshKey] = useState(0);
  // エージェントの変更の影響を受けた画面ごとの読み直し回数。表示中の画面の key に使い、
  // 影響の無い画面（入力途中の設定など）は作り直さない。
  const [viewReloads, setViewReloads] = useState<Partial<Record<AppView, number>>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<ChatSession | null>(null);
  // 会話クリアはパネル側の操作だが、ボタンはヘッダー（履歴の隣）に置くためハンドラを受け取る。
  const clearChatRef = useRef<(() => void) | null>(null);
  const [canClearChat, setCanClearChat] = useState(false);
  const handleClearReady = useCallback((handler: (() => void) | null) => {
    clearChatRef.current = handler;
    setCanClearChat(handler !== null);
  }, []);

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

  // 「端末に合わせる」の間は、開いたまま端末の外観設定が変わっても追随する。
  useEffect(() => (themeMode === "system" ? followSystemTheme() : undefined), [themeMode]);

  // 画面・年度（と確定申告タブ）の状態をURLへ反映する。初回だけ履歴を汚さず置き換える。
  // 帳簿を読み終えるまでは年度が決まらない（取引のある年度から選び直される）ので反映しない。
  // 読み込み中に反映すると、仮の年度の履歴が積まれ、「戻る」でその年度が保存されてしまう。
  const firstUrlSyncRef = useRef(true);
  useEffect(() => {
    if (ledgerLoading) return;
    const path = pathForView(activeView, year, filingTab);
    if (window.location.pathname !== path) {
      if (firstUrlSyncRef.current) {
        window.history.replaceState(null, "", path);
      } else {
        window.history.pushState(null, "", path);
      }
    }
    firstUrlSyncRef.current = false;
  }, [activeView, year, filingTab, ledgerLoading]);

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
  const handleNavChildSelect = (view: AppView, key: FilingTab) => {
    if (view === AppView.Filing) setFilingTab(key);
    setActiveView(view);
  };
  const handleAgentConnectionChange = (config: AgentConnectionConfig) => {
    setAgentConnection(config);
    // APIキーは localStorage に置かずセッション保存にする（utils/agentConnection）
    saveAgentConnection(config);
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
      setViewReloads((current) => ({ ...current, [action.view]: (current[action.view] ?? 0) + 1 }));
    } else if (action.type === "reloadTransactions") {
      reloadTransactions();
    } else if (action.type === "setTheme") {
      handleThemeModeChange(action.mode);
    } else if (appViews.some((view) => view.id === action.view)) {
      setActiveView(action.view);
    }
  };

  const active = appViews.find((view) => view.id === activeView) ?? appViews[0];
  const ActiveComponent = active.Component;

  // 認証ゲート: 確認中はスケルトン、必須モードで未ログイン（または
  // メールリンク等の処理が必要）ならログイン画面を出す。
  if (!authChecked) {
    return <DashboardSkeleton year={year} />;
  }
  if (loginRequired && authConfig) {
    return (
      <LoginPage
        config={authConfig}
        onAuthenticated={() => void refreshAuth()}
        magic={authQueryRef.current.magic}
        authError={authQueryRef.current.authError}
        verify={authQueryRef.current.verify}
        totpChallenge={authQueryRef.current.totpChallenge}
      />
    );
  }

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
      navChildren={filingNavChildren}
      activeNavChildKey={filingTab}
      onNavChildSelect={handleNavChildSelect}
    >
      {ledgerLoading ? (
        activeView === AppView.Dashboard ? (
          <DashboardSkeleton year={year} />
        ) : activeView === AppView.Ledger ? (
          <TableSkeleton />
        ) : (
          <PageSkeleton />
        )
      ) : (
        <ActiveComponent
          key={`${viewRefreshKey}:${viewReloads[active.id] ?? 0}`}
          transactions={transactions}
          year={year}
          onUseTransactions={handleUseImported}
          onRegisterTransaction={handleRegisterTransaction}
          onUseImportedCsv={handleUseCsvImported}
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
      )}
    </AppTemplate>
  );
};
