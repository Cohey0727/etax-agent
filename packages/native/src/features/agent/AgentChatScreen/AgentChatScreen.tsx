import { applyDeductionPatch } from "@etax/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AgentConnectionConfig } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AgentChatPanel } from "../AgentChatPanel";
import { AgentUiAction } from "../agentChatHelpers";
import { loadDeductionState, saveDeductionState } from "@/features/filing/deductionState";
import {
  EMPTY_AGENT_CONNECTION,
  loadAgentConnection,
} from "@/features/settings/agentConnectionStorage";
import { useAppState } from "@/state/AppContext";
import { useChatSheet } from "@/state/ChatSheetContext";

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
      if (action.type === "setYear") {
        setYear(action.year);
      } else if (action.type === "navigate") {
        onBeforeNavigate?.();
        router.navigate(action.route);
      } else if (action.type === "reloadTransactions" || action.type === "reloadView") {
        void reloadLedger();
      } else if (action.type === "applyDeductions") {
        void (async () => {
          const current = await loadDeductionState(user?.id ?? null, action.year);
          saveDeductionState(
            user?.id ?? null,
            action.year,
            applyDeductionPatch(current, action.patch),
          );
        })();
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
