import { Transaction, filterYear, transactionBusinessAmount } from "@etax/shared";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { AppText, Card } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatYen } from "@/utils";
import { formatCompactYen } from "../format";

interface CategoryAmount {
  category: string;
  amount: number;
}

const MAX_SLICES = 6;

const SLICE_COLORS: readonly string[] = [
  "#4a3aff",
  "#0d9488",
  "#d97706",
  "#0284c7",
  "#9333ea",
  "#db2777",
  "#16a34a",
  "#ea580c",
];
const OTHER_COLOR = "#9ca3af";

const CATEGORY_COLOR_INDEX: Record<string, number> = {
  売上高: 0,
  家賃収入: 1,
  雑費: 2,
  消耗品費: 3,
  旅費交通費: 4,
  通信費: 5,
};

export interface BreakdownPanelProps {
  transactions: Transaction[];
  year: number;
}

/**
 * 収入の内訳・支出の内訳（勘定科目ごとのドーナツグラフ）。
 * 集計範囲は事業＋不動産だけ（「その他」区分の資金移動は含めない）。
 * その年の取引が無い年は表示しない。
 */
export function BreakdownPanel({ transactions, year }: BreakdownPanelProps) {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const scoped = useMemo(
    () => yearTransactions.filter((t) => t.income_type !== "other"),
    [yearTransactions],
  );
  const income = useMemo(
    () => sumByCategory(scoped.filter((t) => transactionBusinessAmount(t) > 0), false),
    [scoped],
  );
  const expenses = useMemo(
    () => sumByCategory(scoped.filter((t) => transactionBusinessAmount(t) < 0), true),
    [scoped],
  );
  if (yearTransactions.length === 0) return null;
  const incomeTotal = income.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
  return (
    <Card>
      <AppText size="lg" weight="bold">
        収入・支出の内訳 — {year}年
      </AppText>
      <BreakdownColumn title="収入の内訳" rows={income} total={incomeTotal} />
      <BreakdownColumn title="支出の内訳" rows={expenses} total={expenseTotal} />
    </Card>
  );
}

interface BreakdownColumnProps {
  title: string;
  rows: readonly CategoryAmount[];
  total: number;
}

function BreakdownColumn({ title, rows, total }: BreakdownColumnProps) {
  const slices = groupSlices(rows);
  const colorIndexes = assignColorIndexes(slices);
  let accumulated = 0;
  const arcs = slices.map((slice, index) => {
    const share = total > 0 ? (slice.amount / total) * 100 : 0;
    const start = accumulated;
    accumulated += share;
    return { ...slice, share, start, colorIndex: colorIndexes[index] ?? -1 };
  });
  return (
    <View style={styles.column}>
      <AppText size="sm" weight="semibold" tone="subtle">
        {title}
      </AppText>
      {rows.length === 0 ? (
        <AppText size="sm" tone="muted">
          なし
        </AppText>
      ) : (
        <>
          <View style={styles.chartWrap}>
            <Svg width={150} height={150} viewBox="0 0 120 120">
              <Circle cx={60} cy={60} r={46} fill="none" stroke={colors.lineSoft} strokeWidth={20} />
              {arcs.map((arc) => {
                const circumference = 2 * Math.PI * 46;
                const dash = Math.max(
                  ((arc.share - (arcs.length > 1 ? 0.7 : 0)) / 100) * circumference,
                  1,
                );
                return (
                  <Circle
                    key={arc.category}
                    cx={60}
                    cy={60}
                    r={46}
                    fill="none"
                    stroke={arc.colorIndex < 0 ? OTHER_COLOR : (SLICE_COLORS[arc.colorIndex] ?? OTHER_COLOR)}
                    strokeWidth={20}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-(arc.start / 100) * circumference}
                    transform="rotate(-90 60 60)"
                  />
                );
              })}
              <SvgText x={60} y={56} textAnchor="middle" fontSize={10} fill={colors.muted}>
                合計
              </SvgText>
              <SvgText x={60} y={74} textAnchor="middle" fontSize={13} fontWeight="600" fill={colors.text}>
                {formatCompactYen(total)}
              </SvgText>
            </Svg>
          </View>
          {arcs.map((arc) => (
            <View key={arc.category} style={styles.legendRow}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: arc.colorIndex < 0 ? OTHER_COLOR : (SLICE_COLORS[arc.colorIndex] ?? OTHER_COLOR) },
                ]}
              />
              <AppText size="sm" style={styles.rowName} numberOfLines={1}>
                {arc.category}
              </AppText>
              <AppText size="sm">{formatYen(arc.amount)}</AppText>
              <AppText size="sm" tone="muted" style={styles.rowShare}>
                {Math.round(arc.share)}%
              </AppText>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function sumByCategory(transactions: Transaction[], absolute: boolean): CategoryAmount[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    const businessAmount = transactionBusinessAmount(t);
    const amount = absolute ? Math.abs(businessAmount) : businessAmount;
    totals.set(t.category, (totals.get(t.category) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function assignColorIndexes(slices: readonly CategoryAmount[]): number[] {
  const used = new Set<number>();
  const result = slices.map((slice) => {
    if (slice.category === "その他") return -1;
    const fixed = CATEGORY_COLOR_INDEX[slice.category];
    if (fixed !== undefined && !used.has(fixed)) {
      used.add(fixed);
      return fixed;
    }
    return -2;
  });
  let next = 0;
  return result.map((index) => {
    if (index !== -2) return index;
    while (used.has(next)) next += 1;
    used.add(next);
    return next % SLICE_COLORS.length;
  });
}

function groupSlices(rows: readonly CategoryAmount[]): CategoryAmount[] {
  if (rows.length <= MAX_SLICES) return [...rows];
  const head = rows.slice(0, MAX_SLICES - 1);
  const rest = rows.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce((sum, row) => sum + row.amount, 0);
  return [...head, { category: "その他", amount: restTotal }];
}

const styles = StyleSheet.create({
  column: { gap: space.sm },
  chartWrap: { alignItems: "center" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  rowName: { flex: 1 },
  rowShare: { width: 40, textAlign: "right" },
});
