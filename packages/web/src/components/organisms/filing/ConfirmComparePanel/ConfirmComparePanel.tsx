import { Card, Col, Row, Text } from "@components/atoms";
import { useFilingStatus } from "@components/organisms/filing/FilingStatusToggle";
import { FilingSnapshot, FilingSnapshotFigures } from "@types";
import { formatDate, formatYen } from "@utils";
import styles from "./ConfirmComparePanel.css";

const COMPARE_ROWS: readonly { key: keyof FilingSnapshotFigures; label: string }[] = [
  { key: "business_income", label: "事業所得" },
  { key: "real_estate_income", label: "不動産所得" },
  { key: "misc_income", label: "雑所得" },
  { key: "total_income", label: "所得合計" },
  { key: "total_deductions", label: "所得控除" },
  { key: "taxable_income", label: "課税所得" },
  { key: "final_tax", label: "所得税額（確定税額）" },
];

export interface ConfirmComparePanelProps {
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 確定スナップショットの一覧（昇順）。未読込・未接続時は null。 */
  snapshots: FilingSnapshot[] | null;
  /** いま画面に出ている計算結果（確定スナップショットと同じ形）。 */
  currentFigures: FilingSnapshotFigures | null;
}

/**
 * 前回確定との比較。「控除・計算」の行の直下に置く。
 * 修正申告は独立した機能ではなく、確定 → 差し戻し → 再確定の流れの中で
 * 直前の確定と比べるだけのものとして、ここに差分を出す。
 * - 差し戻し中（未確定）: 直前の確定と現在の計算の差分を出す。
 * - 再確定後: 直前の確定と最新の確定の差分を出す。
 * 初回の確定（前回が無い）では何も出さない。
 */
export const ConfirmComparePanel = ({
  year,
  snapshots,
  currentFigures,
}: ConfirmComparePanelProps) => {
  const { status } = useFilingStatus(year);
  if (!snapshots || snapshots.length === 0 || !currentFigures) return null;

  const last = snapshots[snapshots.length - 1];
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : undefined;

  let title: string;
  let base: FilingSnapshotFigures;
  let target: FilingSnapshotFigures;
  let targetLabel: string;
  if (!status.calculated) {
    title = `前回確定（${formatDate(last.confirmed_at)}）との差分`;
    base = last.figures;
    target = currentFigures;
    targetLabel = "現在の計算";
  } else if (prev) {
    title = `前回確定（${formatDate(prev.confirmed_at)}）との比較`;
    base = prev.figures;
    target = last.figures;
    targetLabel = `今回の確定（${formatDate(last.confirmed_at)}）`;
  } else {
    return null;
  }

  const hasChange = COMPARE_ROWS.some((row) => target[row.key] !== base[row.key]);

  return (
    <Card>
      <Col gap="sm">
        <Text className={styles.title}>{title}</Text>
        {hasChange ? (
          COMPARE_ROWS.map((row) => {
            const delta = target[row.key] - base[row.key];
            return (
              <Row key={row.key} align="center" justify="spaceBetween" gap="md">
                <Text variant="muted">{row.label}</Text>
                <Row gap="md" align="center">
                  <Text className={styles.amount}>
                    {formatYen(base[row.key])} → {formatYen(target[row.key])}
                  </Text>
                  <span className={delta !== 0 ? styles.deltaChanged : styles.delta}>
                    {formatDelta(delta)}
                  </span>
                </Row>
              </Row>
            );
          })
        ) : (
          <Text variant="muted">
            前回確定から変更はありません（{targetLabel}は前回と同じ内容です）。
          </Text>
        )}
      </Col>
    </Card>
  );
};

function formatDelta(delta: number): string {
  if (delta === 0) return "±0円";
  if (delta > 0) return `+${formatYen(delta)}`;
  return `−${formatYen(-delta)}`;
}
