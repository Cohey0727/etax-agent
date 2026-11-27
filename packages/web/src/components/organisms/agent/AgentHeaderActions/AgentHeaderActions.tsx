import { Button } from "@components/atoms";

export interface AgentHeaderActionsProps {
  /** 履歴の一覧か、保存済みの会話を見ているか。 */
  inHistory: boolean;
  sessionCount: number;
  /** クリアできる会話があるか（会話が空・応答待ちのときはクリアしない）。 */
  canClear: boolean;
  onOpenHistory: () => void;
  onBackToChat: () => void;
  onClear: () => void;
}

/** エージェントパネルの見出しの右に置く、会話の履歴とクリアのボタン。 */
export const AgentHeaderActions = ({
  inHistory,
  sessionCount,
  canClear,
  onOpenHistory,
  onBackToChat,
  onClear,
}: AgentHeaderActionsProps) => {
  if (inHistory) {
    return (
      <Button variant="ghost" size="sm" onClick={onBackToChat}>
        ← チャットに戻る
      </Button>
    );
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={sessionCount === 0}
        disabledReason="履歴がありません"
        onClick={onOpenHistory}
      >
        履歴{sessionCount > 0 ? `（${sessionCount}）` : ""}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!canClear}
        disabledReason="クリアできる会話がありません"
        onClick={onClear}
      >
        クリア
      </Button>
    </>
  );
};
