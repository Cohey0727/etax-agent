import { StyleSheet, View } from "react-native";
import { TrialBalanceLine, TrialBalancePl } from "@/api";
import { AppText, Card } from "@/components";
import { formatYen } from "@/utils";
import { tableStyles } from "../tableStyles";

export interface PlSectionProps {
  title: string;
  year: number;
  current: TrialBalancePl;
  previous: TrialBalancePl;
}

type PlRowKind = "line" | "subtotal" | "total";

interface PlRow {
  label: string;
  current: number;
  previous: number;
  kind: PlRowKind;
}

/** 損益計算書（1区分分）。前年との比較（増減）も並べる。 */
export function PlSection({ title, year, current, previous }: PlSectionProps) {
  const rows = buildRows(current, previous);
  const isEmpty =
    current.revenue === 0 &&
    current.expenses === 0 &&
    current.purchases === 0 &&
    previous.revenue === 0 &&
    previous.expenses === 0 &&
    previous.purchases === 0;
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        {title}
      </AppText>
      {isEmpty ? (
        <AppText size="sm" tone="muted">
          この区分の取引はありません。
        </AppText>
      ) : (
        <View>
          <View style={[tableStyles.row, tableStyles.headRow]}>
            <AppText size="sm" weight="bold" style={tableStyles.label}>科目</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>{year}年</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>{year - 1}年</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>増減</AppText>
          </View>
          {rows.map((row) => (
            <View
              key={row.label}
              style={[
                tableStyles.row,
                row.kind === "total" ? tableStyles.totalRow : null,
                row.kind === "subtotal" ? tableStyles.subtotalRow : null,
              ]}
            >
              <AppText
                size="sm"
                weight={row.kind === "line" ? "regular" : "semibold"}
                style={tableStyles.label}
              >
                {row.label}
              </AppText>
              <AppText size="sm" weight={row.kind === "total" ? "bold" : "regular"} style={styles.cell}>
                {formatYen(row.current)}
              </AppText>
              <AppText size="sm" style={styles.cell}>{formatYen(row.previous)}</AppText>
              <AppText size="sm" style={styles.cell}>{formatDiff(row.current - row.previous)}</AppText>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function buildRows(current: TrialBalancePl, previous: TrialBalancePl): PlRow[] {
  const rows: PlRow[] = [];
  rows.push({ label: "売上（収入）金額", current: current.revenue, previous: previous.revenue, kind: "subtotal" });
  for (const line of current.revenue_lines) {
    rows.push({
      label: line.category,
      current: line.amount,
      previous: previousAmount(previous.revenue_lines, line.category),
      kind: "line",
    });
  }
  if (current.purchases > 0 || previous.purchases > 0) {
    rows.push({ label: "仕入高", current: current.purchases, previous: previous.purchases, kind: "line" });
    rows.push({
      label: "差引金額（売上総利益）",
      current: current.revenue - current.purchases,
      previous: previous.revenue - previous.purchases,
      kind: "subtotal",
    });
  }
  for (const line of current.expense_lines) {
    rows.push({
      label: line.category,
      current: line.amount,
      previous: previousAmount(previous.expense_lines, line.category),
      kind: "line",
    });
  }
  rows.push({ label: "経費計", current: current.expenses, previous: previous.expenses, kind: "subtotal" });
  rows.push({
    label: "差引金額",
    current: current.income_before_blue,
    previous: previous.income_before_blue,
    kind: "subtotal",
  });
  rows.push({
    label: "青色申告特別控除",
    current: current.blue_deduction,
    previous: previous.blue_deduction,
    kind: "line",
  });
  rows.push({ label: "所得金額", current: current.income, previous: previous.income, kind: "total" });
  return rows;
}

function previousAmount(lines: TrialBalanceLine[], category: string): number {
  return lines.find((line) => line.category === category)?.amount ?? 0;
}

function formatDiff(diff: number): string {
  if (diff === 0) return "―";
  return diff > 0 ? `+${formatYen(diff)}` : formatYen(diff);
}

const styles = StyleSheet.create({
  cell: { width: 92, textAlign: "right" },
});
