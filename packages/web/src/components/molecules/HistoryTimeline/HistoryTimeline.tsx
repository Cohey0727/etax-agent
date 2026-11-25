import { Fragment } from "react";
import { Badge, Col, Row, Text } from "@components/atoms";
import { HistoryTimelineEntry } from "./historyChanges";
import styles from "./HistoryTimeline.css";

export interface HistoryTimelineProps {
  /** 新しい順に並んだ履歴。 */
  entries: readonly HistoryTimelineEntry[];
  /** 履歴が無いときに出す文言。 */
  emptyText?: string;
}

/**
 * 変更履歴のタイムライン（登録・訂正・削除の時系列表示）。
 * 項目ごとの変更前 → 変更後を並べ、差分がそのまま読める形にする。
 * ドメイン知識は持たず、整形済みの entries を描くだけ。
 */
export const HistoryTimeline = ({ entries, emptyText }: HistoryTimelineProps) => {
  if (entries.length === 0) {
    return <Text variant="muted">{emptyText ?? "履歴はまだありません。"}</Text>;
  }
  return (
    <Col gap="lg">
      {entries.map((entry) => (
        <Col key={entry.id} gap="sm" className={styles.entry}>
          <Row gap="sm" align="center">
            <Badge>{entry.actionLabel}</Badge>
            <Text variant="muted">{entry.occurredAt}</Text>
          </Row>
          {entry.summary ? <Text>{entry.summary}</Text> : null}
          {entry.changes.length > 0 ? (
            <div className={styles.changes}>
              {entry.changes.map((change) => (
                <Fragment key={change.label}>
                  <Text variant="muted">{change.label}</Text>
                  <Text className={styles.beforeValue}>{change.before}</Text>
                  <Text variant="muted">→</Text>
                  <Text>{change.after}</Text>
                </Fragment>
              ))}
            </div>
          ) : (
            <Text variant="muted">項目の変更はありません。</Text>
          )}
        </Col>
      ))}
    </Col>
  );
};
