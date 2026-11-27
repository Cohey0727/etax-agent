import { CategoryBreakdown, Transaction, categoryBreakdown, filterYear } from "@etax/shared";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { AppText, Card } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatYen } from "@/utils";
import { formatCompactYen } from "../format";

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
  const income = useMemo(() => categoryBreakdown(yearTransactions, "income"), [yearTransactions]);
  const expenses = useMemo(
    () => categoryBreakdown(yearTransactions, "expense"),
    [yearTransactions],
  );
  if (yearTransactions.length === 0) return null;
  return (
    <Card>
      <AppText size="lg" weight="bold">
        収入・支出の内訳 — {year}年
      </AppText>
      <BreakdownColumn title="収入の内訳" breakdown={income} />
      <BreakdownColumn title="支出の内訳" breakdown={expenses} />
    </Card>
  );
}

interface BreakdownColumnProps {
  title: string;
  breakdown: CategoryBreakdown;
}

function BreakdownColumn({ title, breakdown }: BreakdownColumnProps) {
  const { rows, total, slices: arcs } = breakdown;
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
                    key={arc.key}
                    cx={60}
                    cy={60}
                    r={46}
                    fill="none"
                    stroke={arc.colorIndex === null ? OTHER_COLOR : (SLICE_COLORS[arc.colorIndex] ?? OTHER_COLOR)}
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
            <View key={arc.key} style={styles.legendRow}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: arc.colorIndex === null ? OTHER_COLOR : (SLICE_COLORS[arc.colorIndex] ?? OTHER_COLOR) },
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

const styles = StyleSheet.create({
  column: { gap: space.sm },
  chartWrap: { alignItems: "center" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  rowName: { flex: 1 },
  rowShare: { width: 40, textAlign: "right" },
});
