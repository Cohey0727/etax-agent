import { useEffect, useState } from "react";
import { Col, Text } from "@components/atoms";
import { Drawer, HistoryTimeline } from "@components/molecules";
import { TransactionHistoryEntry } from "@types";
import { fetchRecentTransactionHistory, fetchTransactionHistory } from "@utils/api";
import { toTransactionTimelineEntry } from "./transactionHistoryFields";

export interface TransactionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  /**
   * 取引を1件に絞るときの取引ID。未指定なら全取引の履歴（削除済みの
   * 取引の履歴も含む）を新しい順に表示する。
   */
  transactionId?: number;
}

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; entries: TransactionHistoryEntry[] };

/**
 * 取引の訂正・削除履歴ビューア（電子帳簿保存法の訂正・削除履歴）。
 * 帳簿ツールバーの「訂正・削除履歴」からは全取引分を、各行の「履歴」
 * からはその取引分だけを開く。
 */
export const TransactionHistoryDrawer = ({
  open,
  onClose,
  transactionId,
}: TransactionHistoryDrawerProps) => {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: "loading" });
    const load =
      transactionId !== undefined
        ? fetchTransactionHistory(transactionId)
        : fetchRecentTransactionHistory();
    void load.then((entries) => {
      if (cancelled) return;
      setState(entries ? { status: "ready", entries } : { status: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  return (
    <Drawer
      open={open}
      title={transactionId !== undefined ? "取引の変更履歴" : "訂正・削除履歴"}
      onClose={onClose}
      width="min(640px, 96vw)"
    >
      {state.status === "loading" ? (
        <Text variant="muted">読み込み中…</Text>
      ) : state.status === "unavailable" ? (
        <Text variant="muted">
          履歴を取得できませんでした。サーバーへの接続を確認してください。
        </Text>
      ) : (
        <Col gap="md">
          <Text variant="muted">
            取引の登録・訂正・削除の記録です（電子帳簿保存法の訂正・削除履歴）。
            新しい順に表示しています。
          </Text>
          <HistoryTimeline
            entries={state.entries.map(toTransactionTimelineEntry)}
            emptyText="変更履歴はまだありません。"
          />
        </Col>
      )}
    </Drawer>
  );
};
