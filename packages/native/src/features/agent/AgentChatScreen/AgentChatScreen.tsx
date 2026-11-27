import { AgentScreen, AgentUiAction } from "@etax/shared";
import { Href, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AgentConnectionConfig } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AgentChatPanel } from "../AgentChatPanel";
import { applyFilingInputsPatch, loadDeductionState } from "@/features/filing/deductionState";
import {
  EMPTY_AGENT_CONNECTION,
  loadAgentConnection,
} from "@/features/settings/agentConnectionStorage";
import { useAppState } from "@/state/AppContext";
import { useChatSheet } from "@/state/ChatSheetContext";

/** エージェントの画面操作の対象 → 遷移先のルート。 */
const agentScreenRoutes = {
  dashboard: "/",
  ledger: "/ledger",
  receipt: "/receipt",
  filing: "/filing",
  taxpayer: "/taxpayer",
  settings: "/settings",
} as const satisfies Record<AgentScreen, Href>;

/**
 * 読み直しの対象の画面ごとに、帳簿を読み直すか。native は画面ごとの読み直しを持たないので
 * 帳簿を読み直す。帳簿・領収書は、同じ操作で届く reloadTransactions で読み直される。
 */
const agentScreenReloadsLedger = {
  dashboard: true,
  ledger: false,
  receipt: false,
  filing: true,
  taxpayer: true,
  settings: true,
} as const satisfies Record<AgentScreen, boolean>;

export interface AgentChatScreenProps {
  /** 別画面へ遷移するUIアクションの直前に呼ばれる（シートを閉じるため）。 */
  onBeforeNavigate?: () => void;
}

/** チャットの画面本体。接続設定の読み込みとUIアクションの適用を担う。 */
export function AgentChatScreen({ onBeforeNavigate }: AgentChatScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { year, transactions, setYear, reloadLedger } = useAppState();
  const { chatOpen } = useChatSheet();
  const [connection, setConnection] = useState<AgentConnectionConfig>(EMPTY_AGENT_CONNECTION);
  const userId = user?.id ?? null;

  // シートは常にマウントされているので、設定画面での変更を開くたびに読み直す
  useEffect(() => {
    if (!chatOpen) return;
    let cancelled = false;
    void loadAgentConnection(userId).then((loaded) => {
      if (!cancelled) setConnection(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [chatOpen, userId]);

  const getDeductionsSnapshot = useCallback(async () => {
    const state = await loadDeductionState(user?.id ?? null, year);
    return { year, state };
  }, [user?.id, year]);

  const handleUiAction = useCallback(
    (action: AgentUiAction) => {
      switch (action.type) {
        case "setYear":
          setYear(action.year);
          return;
        case "navigate":
          onBeforeNavigate?.();
          router.navigate(agentScreenRoutes[action.screen]);
          return;
        case "reloadTransactions":
          void reloadLedger();
          return;
        case "reloadView":
          if (agentScreenReloadsLedger[action.screen]) void reloadLedger();
          return;
        case "applyDeductions":
          // 開いている確定申告・納税者情報の画面は同じストアを読むので、そのまま反映される
          void applyFilingInputsPatch(user?.id ?? null, action.year, action.patch);
          return;
        case "setTheme":
          // ネイティブにはテーマ切替の相当物がないため適用しない
          return;
        default:
          return action satisfies never;
      }
    },
    [router, setYear, reloadLedger, user?.id, onBeforeNavigate],
  );

  return (
    <AgentChatPanel
      userId={user?.id ?? null}
      transactions={transactions}
      connection={connection}
      getDeductionsSnapshot={getDeductionsSnapshot}
      onUiAction={handleUiAction}
    />
  );
}
