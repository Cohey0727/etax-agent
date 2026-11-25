import { useEffect, useState } from "react";
import { Col, Text } from "@components/atoms";
import { Drawer, HistoryTimeline } from "@components/molecules";
import { FilingSubmissionHistoryEntry, FilingSubmissionKind } from "@types";
import { fetchFilingSubmissionHistory } from "@utils/api";
import { toSubmissionTimelineEntry } from "./submissionHistoryFields";

export interface SubmissionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 対象年。履歴は年度単位で取得し、税目で絞って表示する。 */
  year: number;
  /** 税目（所得税 / 消費税）。 */
  kind: FilingSubmissionKind;
}

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; entries: FilingSubmissionHistoryEntry[] };

const KIND_LABELS: Record<FilingSubmissionKind, string> = {
  income: "所得税",
  consumption: "消費税",
};

/**
 * 提出の記録の変更履歴ビューア。提出の記録パネルの「変更履歴」から開き、
 * その税目分の登録・更新・削除を時系列で表示する。
 */
export const SubmissionHistoryDrawer = ({
  open,
  onClose,
  year,
  kind,
}: SubmissionHistoryDrawerProps) => {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: "loading" });
    void fetchFilingSubmissionHistory(year).then((entries) => {
      if (cancelled) return;
      setState(
        entries
          ? { status: "ready", entries: entries.filter((entry) => entry.kind === kind) }
          : { status: "unavailable" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, year, kind]);

  return (
    <Drawer
      open={open}
      title={`提出の記録の変更履歴（${KIND_LABELS[kind]}）`}
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
            提出の記録の登録・更新・削除の記録です。新しい順に表示しています。
          </Text>
          <HistoryTimeline
            entries={state.entries.map(toSubmissionTimelineEntry)}
            emptyText="変更履歴はまだありません。"
          />
        </Col>
      )}
    </Drawer>
  );
};
