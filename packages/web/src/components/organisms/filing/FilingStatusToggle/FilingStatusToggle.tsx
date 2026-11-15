import { Button, Card, Col, Row, Text } from "@components/atoms";
import { FilingStatusKey, useFilingStatus } from "./useFilingStatus";
import styles from "./FilingStatusToggle.css";

export interface FilingStatusToggleProps {
  year: number;
  /** 対象のステータス項目（帳簿 = confirmed、控除・計算 = calculated）。 */
  statusKey: FilingStatusKey;
  label: string;
  description: string;
  /** 未確定→確定に切り替えた直後に呼ばれる（確定スナップショットの保存など）。 */
  onConfirm?: () => Promise<void>;
}

/**
 * 各タブの末尾に置く「確定する」バー。そのタブの作業を終えたら
 * その場で確定でき、総合タブ・ダッシュボードと状態を共有する。
 */
export const FilingStatusToggle = ({
  year,
  statusKey,
  label,
  description,
  onConfirm,
}: FilingStatusToggleProps) => {
  const { status, loaded, available, savingKey, toggle } = useFilingStatus(year);
  const done = status[statusKey];
  const doneAt = status[`${statusKey}_at`];

  const handleClick = async () => {
    const turningOn = !done;
    await toggle(statusKey);
    if (turningOn && onConfirm) await onConfirm();
  };

  return (
    <Card>
      <Row gap="md" align="center" justify="spaceBetween">
        <Col gap="sm" className={styles.itemMain}>
          <Text className={styles.itemLabel}>
            {label}
            <span className={done ? styles.stateDone : styles.stateTodo}>
              {done ? `確定${doneAt ? `（${formatDate(doneAt)}）` : ""}` : "未確定"}
            </span>
          </Text>
          <Text variant="muted">{description}</Text>
          {loaded && !available ? (
            <Text variant="muted">
              ステータスを保存するサーバーに接続できていません。「確定する」は接続時に使えます。
            </Text>
          ) : null}
        </Col>
        <Button
          variant={done ? "ghost" : "primary"}
          disabled={!available || savingKey === statusKey}
          onClick={() => void handleClick()}
        >
          {done ? "確定解除" : "確定する"}
        </Button>
      </Row>
    </Card>
  );
};

function formatDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "/");
}
