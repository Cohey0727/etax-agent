import { ReactNode } from "react";
import { Badge, Button, Col, Row, Text } from "@components/atoms";
import { formatDate } from "@utils";
import { FilingStatusKey, UseFilingStatusResult } from "./useFilingStatus";
import styles from "./FilingStatusToggle.css";

export interface FilingStatusToggleProps {
  /** 対象のステータス項目（収支 = confirmed、控除・計算 = calculated）。 */
  statusKey: FilingStatusKey;
  label: string;
  description: string;
  /** 確定申告画面が持つ申告ステータス。 */
  filingStatus: UseFilingStatusResult;
  /** 「確定する／確定解除」を押したとき。 */
  onToggle: (key: FilingStatusKey) => void;
  /** 確定ボタンの手前に並べる操作（そのタブを開くボタンなど）。 */
  children?: ReactNode;
}

/**
 * 「確定する／確定解除」のバー。そのタブの作業を終えたらその場で
 * 確定でき、総合タブ・ダッシュボードと状態を共有する。
 * カードで包むかどうかは置く側が決める。
 */
export const FilingStatusToggle = ({
  statusKey,
  label,
  description,
  filingStatus,
  onToggle,
  children,
}: FilingStatusToggleProps) => {
  const { status, available, savingKey } = filingStatus;
  const done = status[statusKey];
  const doneAt = status[`${statusKey}_at`];

  return (
    <Row gap="md" align="center" justify="spaceBetween" wrap>
      <Col gap="sm" className={styles.itemMain}>
        <Text className={styles.itemLabel}>
          {label}
          <Badge tone={done ? "accent" : "muted"}>
            {done ? `確定${doneAt ? `（${formatDate(doneAt)}）` : ""}` : "未確定"}
          </Badge>
        </Text>
        <Text variant="muted">{description}</Text>
      </Col>
      <Row gap="sm" align="center">
        {children}
        <Button
          variant={done ? "ghost" : "primary"}
          disabled={!available || savingKey === statusKey}
          disabledReason={
            savingKey === statusKey ? "保存中です" : "ステータス保存サーバーに接続できていません"
          }
          onClick={() => onToggle(statusKey)}
        >
          {done ? "確定解除" : "確定する"}
        </Button>
      </Row>
    </Row>
  );
};
