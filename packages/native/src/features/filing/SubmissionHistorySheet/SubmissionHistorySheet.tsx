import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, LabeledValue, Sheet, SkeletonCard } from "@/components";
import {
  FilingSubmission,
  FilingSubmissionHistoryEntry,
  FilingSubmissionKind,
  fetchFilingSubmissionHistory,
} from "@/api";
import { space } from "@/theme";
import { formatDate } from "@/utils";

export interface SubmissionHistorySheetProps {
  visible: boolean;
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

const ACTION_LABELS: Record<string, string> = {
  created: "登録",
  updated: "訂正",
  deleted: "削除",
};

/**
 * 提出の記録の変更履歴ビューア。提出の記録パネルの「変更履歴」から開き、
 * その税目分の登録・更新・削除を時系列で表示する。
 */
export function SubmissionHistorySheet({
  visible,
  onClose,
  year,
  kind,
}: SubmissionHistorySheetProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, year, kind]);

  return (
    <Sheet
      visible={visible}
      title={`提出の記録の変更履歴（${KIND_LABELS[kind]}）`}
      onClose={onClose}
      scroll
    >
      {state.status === "loading" ? (
        <SkeletonCard />
      ) : state.status === "unavailable" ? (
        <AppText size="sm" tone="muted">
          履歴を取得できませんでした。サーバーへの接続を確認してください。
        </AppText>
      ) : (
        <View style={styles.wrap}>
          <AppText size="sm" tone="muted">
            提出の記録の登録・更新・削除の記録です。新しい順に表示しています。
          </AppText>
          {state.entries.length === 0 ? (
            <AppText size="sm" tone="muted">
              変更履歴はまだありません。
            </AppText>
          ) : (
            state.entries.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)
          )}
        </View>
      )}
    </Sheet>
  );
}

function HistoryEntry({ entry }: { entry: FilingSubmissionHistoryEntry }) {
  const snapshot = entry.after ?? entry.before;
  return (
    <View style={styles.entry}>
      <View style={styles.entryHead}>
        <AppText size="md" weight="semibold">
          {ACTION_LABELS[entry.action] ?? entry.action}
        </AppText>
        <AppText size="sm" tone="muted">
          {formatDate(entry.created_at)}
        </AppText>
      </View>
      <AppText size="sm" tone="muted">
        {snapshot?.acceptance_number ? `受付番号: ${snapshot.acceptance_number}` : "受付番号なし"}
      </AppText>
      {entry.before ? <SnapshotFields title="変更前" snapshot={entry.before} /> : null}
      {entry.after ? <SnapshotFields title="変更後" snapshot={entry.after} /> : null}
    </View>
  );
}

function SnapshotFields({ title, snapshot }: { title: string; snapshot: FilingSubmission }) {
  return (
    <View>
      <AppText size="sm" weight="semibold" tone="subtle">
        {title}
      </AppText>
      <LabeledValue label="受付番号" value={snapshot.acceptance_number || "―"} />
      <LabeledValue label="提出日" value={snapshot.submitted_date ?? "―"} />
      <LabeledValue label="受信通知PDF" value={snapshot.receipt ? "添付あり" : "なし"} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  entry: { gap: space.xs },
  entryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
