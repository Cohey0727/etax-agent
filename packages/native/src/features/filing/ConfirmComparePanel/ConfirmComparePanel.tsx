import { StyleSheet, View } from "react-native";
import { AppText, Card } from "@/components";
import { colors, space } from "@/theme";
import { formatDate, formatYen } from "@/utils";
import { FilingSnapshot, FilingSnapshotFigures } from "@/api";
import { useFilingStatus } from "../useFilingStatus";

const compareRows: readonly { key: keyof FilingSnapshotFigures; label: string }[] = [
  { key: "business_income", label: "事業所得" },
  { key: "real_estate_income", label: "不動産所得" },
  { key: "misc_income", label: "雑所得" },
  { key: "total_income", label: "所得合計" },
  { key: "total_deductions", label: "所得控除" },
  { key: "taxable_income", label: "課税所得" },
  { key: "final_tax", label: "所得税額（確定税額）" },
];

export interface ConfirmComparePanelProps {
  /** 選択中の年度 */
  year: number;
  /** 確定スナップショットの一覧（昇順）。未読込・未接続時は null。 */
  snapshots: FilingSnapshot[] | null;
  /** いま画面に出ている計算結果（確定スナップショットと同じ形）。 */
  currentFigures: FilingSnapshotFigures | null;
  /** カードで囲まずに置く（総合タブの項目行の直下など）。 */
  bare?: boolean;
}

/**
 * 前回確定との比較。「控除・計算」の行の直下に置く。
 * 修正申告は独立した機能ではなく、確定 → 差し戻し → 再確定の流れの中で
 * 直前の確定と比べるだけのものとして、ここに差分を出す。
 * - 差し戻し中（未確定）: 直前の確定と現在の計算の差分を出す。
 * - 再確定後: 直前の確定と最新の確定の差分を出す。
 * 初回の確定（前回が無い）では何も出さない。
 */
export function ConfirmComparePanel({
  year,
  snapshots,
  currentFigures,
  bare = false,
}: ConfirmComparePanelProps) {
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

  const hasChange = compareRows.some((row) => target[row.key] !== base[row.key]);

  const content = (
    <View style={styles.wrap}>
      <AppText size="md" weight="bold">
        {title}
      </AppText>
      {hasChange ? (
        compareRows.map((row) => {
          const delta = target[row.key] - base[row.key];
          return (
            <View key={row.key} style={styles.row}>
              <AppText size="sm" tone="muted" style={styles.rowLabel}>
                {row.label}
              </AppText>
              <AppText size="sm">
                {formatYen(base[row.key])} → {formatYen(target[row.key])}
              </AppText>
              <AppText
                size="sm"
                weight="semibold"
                style={{ color: delta !== 0 ? colors.negative : colors.muted }}
              >
                {formatDelta(delta)}
              </AppText>
            </View>
          );
        })
      ) : (
        <AppText size="sm" tone="muted">
          前回確定から変更はありません（{targetLabel}は前回と同じ内容です）。
        </AppText>
      )}
    </View>
  );

  return bare ? content : <Card>{content}</Card>;
}

function formatDelta(delta: number): string {
  if (delta === 0) return "±0円";
  if (delta > 0) return `+${formatYen(delta)}`;
  return `−${formatYen(-delta)}`;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    flexWrap: "wrap",
  },
  rowLabel: { minWidth: 110 },
});
