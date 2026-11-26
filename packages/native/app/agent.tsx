import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AgentConnectionConfig } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { ScreenContainer } from "@/components/ScreenContainer";
import { AgentChatPanel, AgentUiAction, applyDeductionPatch } from "@/features/agent";
import {
  loadDeductionState,
  saveDeductionState,
} from "@/features/filing/deductionState";
import {
  EMPTY_AGENT_CONNECTION,
  loadAgentConnection,
} from "@/features/settings/agentConnectionStorage";
import { useAppState } from "@/state/AppContext";

export default function AgentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { year, transactions, setYear, reloadLedger } = useAppState();
  const [connection, setConnection] = useState<AgentConnectionConfig>(EMPTY_AGENT_CONNECTION);

  useEffect(() => {
    void loadAgentConnection().then(setConnection);
  }, []);

  const getDeductionsSnapshot = useCallback(async () => {
    const state = await loadDeductionState(user?.id ?? null, year);
    return { year, state };
  }, [user?.id, year]);

  const handleUiAction = useCallback(
    (action: AgentUiAction) => {
      if (action.type === "setYear") {
        setYear(action.year);
      } else if (action.type === "navigate") {
        router.push(action.route);
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
    [router, setYear, reloadLedger, user?.id],
  );

  return (
    <ScreenContainer noScroll>
      <AgentChatPanel
        userId={user?.id ?? null}
        transactions={transactions}
        connection={connection}
        getDeductionsSnapshot={getDeductionsSnapshot}
        onUiAction={handleUiAction}
      />
    </ScreenContainer>
  );
}
