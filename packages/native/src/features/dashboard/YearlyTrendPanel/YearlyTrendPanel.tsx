import { Transaction, yearlyIncomeTotals } from "@etax/shared";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { AppText, Card, LabeledValue } from "@/components";
import { colors, space } from "@/theme";
import { formatYen } from "@/utils";
import { formatCompactYen } from "../format";

type SeriesKey = "revenue" | "expenses" | "balance";

const SERIES: readonly { key: SeriesKey; label: string; color: string }[] = [
  { key: "revenue", label: "売上", color: "#4a3aff" },
  { key: "expenses", label: "経費", color: "#e5484d" },
  { key: "balance", label: "収支", color: "#0d9488" },
];

const GROUP_PITCH = 150;
const BAR_WIDTH = 30;
const BAR_GAP = 8;
const CHART_HEIGHT = 196;
const BASELINE_Y = 150;
const TOP_Y = 28;

export interface YearlyTrendPanelProps {
  transactions: Transaction[];
}

/** 年度を跨ぐ推移（売上・経費・収支）。事業＋不動産の集計を棒グラフ＋金額で並べる。 */
export function YearlyTrendPanel({ transactions }: YearlyTrendPanelProps) {
  const years = useMemo(() => yearlyIncomeTotals(transactions), [transactions]);

  if (years.length === 0) return null;

  const maxPositive = Math.max(1, ...years.flatMap((y) => [y.revenue, y.expenses, Math.max(y.balance, 0)]));
  const maxNegative = Math.max(1, ...years.map((y) => Math.max(-y.balance, 0)));
  const posScale = (BASELINE_Y - TOP_Y) / maxPositive;
  const negScale = (CHART_HEIGHT - 24 - BASELINE_Y) / maxNegative;
  const width = years.length * GROUP_PITCH + 16;

  return (
    <Card>
      <View style={styles.header}>
        <AppText size="lg" weight="bold">
          年度ごとの推移
        </AppText>
        <View style={styles.legend}>
          {SERIES.map((series) => (
            <View key={series.key} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: series.color }]} />
              <AppText size="sm" tone="muted">
                {series.label}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
          <Line x1={0} y1={BASELINE_Y} x2={width} y2={BASELINE_Y} stroke={colors.borderStrong} strokeWidth={1} />
          {years.map((totals, yearIndex) => {
            const groupX = 8 + yearIndex * GROUP_PITCH;
            return (
              <G key={totals.year}>
                {SERIES.map((series, seriesIndex) => {
                  const value = totals[series.key];
                  const x = groupX + seriesIndex * (BAR_WIDTH + BAR_GAP);
                  const center = x + BAR_WIDTH / 2;
                  if (value >= 0) {
                    const height = Math.max(value * posScale, value > 0 ? 2 : 0);
                    return (
                      <G key={series.key}>
                        <Rect x={x} y={BASELINE_Y - height} width={BAR_WIDTH} height={height} rx={4} fill={series.color} />
                        <SvgText x={center} y={BASELINE_Y - height - 5} textAnchor="middle" fontSize={10} fill={colors.muted}>
                          {formatCompactYen(value)}
                        </SvgText>
                      </G>
                    );
                  }
                  const height = Math.max(-value * negScale, 2);
                  return (
                    <G key={series.key}>
                      <Rect x={x} y={BASELINE_Y} width={BAR_WIDTH} height={height} rx={4} fill={colors.negative} />
                      <SvgText x={center} y={BASELINE_Y + height + 13} textAnchor="middle" fontSize={10} fill={colors.muted}>
                        {formatCompactYen(value)}
                      </SvgText>
                    </G>
                  );
                })}
                <SvgText x={groupX + 53} y={BASELINE_Y + 20} textAnchor="middle" fontSize={11} fill={colors.text}>
                  {totals.year}年
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </ScrollView>
      <View style={styles.table}>
        {years.map((totals) => (
          <View key={totals.year} style={styles.yearBlock}>
            <AppText size="sm" weight="bold" tone="subtle">
              {totals.year}年
            </AppText>
            <LabeledValue label="売上" value={formatYen(totals.revenue)} />
            <LabeledValue label="経費" value={formatYen(totals.expenses)} />
            <LabeledValue label="収支" value={formatYen(totals.balance)} strong />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  legend: { flexDirection: "row", gap: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  table: { gap: space.sm },
  yearBlock: { gap: 0 },
});
