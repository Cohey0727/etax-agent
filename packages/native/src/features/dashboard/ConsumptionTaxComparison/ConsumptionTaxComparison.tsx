import { ConsumptionComparisonRow, ConsumptionMethod } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInRight } from "react-native-reanimated";
import { AppText, Card, LabeledValue } from "@/components";
import { colors, radius, space, springs } from "@/theme";
import { formatNumber, formatYen } from "@/utils";

export interface ConsumptionTaxComparisonProps {
  year: number;
  taxable: number;
  nontaxable: number;
  inputTax: number;
  results: readonly ConsumptionComparisonRow[];
}

const methodDetails = {
  standard: { label: "本則課税", color: colors.barStandard },
  simplified: { label: "簡易課税（第5種・50%）", color: colors.barSimplified },
  special20: { label: "2割特例", color: colors.barSpecial },
} as const satisfies Record<ConsumptionMethod, { label: string; color: string }>;

/** 消費税の3方式（本則・簡易・2割特例）の納付税額の比較。 */
export function ConsumptionTaxComparison({
  year,
  taxable,
  nontaxable,
  inputTax,
  results,
}: ConsumptionTaxComparisonProps) {
  const maxPayable = Math.max(...results.map((r) => r.payable), 0);
  return (
    <Card>
      <AppText size="lg" weight="bold">
        消費税 — 3方式の比較（{year}年）
      </AppText>
      <AppText size="sm" tone="muted">
        課税売上（税込）{formatYen(taxable)} ／ 非課税売上（住宅家賃）{formatYen(nontaxable)} ／
        仕入税額（経費からの概算）{formatYen(inputTax)}
      </AppText>
      <View style={styles.bars}>
        {results.map((row, index) => {
          const detail = methodDetails[row.method];
          const ratio = maxPayable > 0 ? Math.max(0, row.payable / maxPayable) : 0;
          return (
            <View key={row.method} style={styles.barRow}>
              <AppText size="sm" style={styles.barLabel} numberOfLines={1}>
                {detail.label}
              </AppText>
              <View style={styles.barTrack}>
                <Animated.View
                  entering={FadeInRight.delay(index * 90)
                    .springify()
                    .damping(springs.soft.damping)
                    .stiffness(springs.soft.stiffness)}
                  style={[
                    styles.barFill,
                    { backgroundColor: detail.color, width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%` },
                  ]}
                />
              </View>
              <AppText size="sm" weight="semibold" style={styles.barAmount}>
                {row.payable < 0 ? `還付 ${formatYen(-row.payable)}` : formatYen(row.payable)}
              </AppText>
            </View>
          );
        })}
      </View>
      <View style={styles.table}>
        {results.map((row) => (
          <View key={row.method}>
            <AppText size="sm" weight="semibold" tone="subtle">
              {methodDetails[row.method].label}
            </AppText>
            <LabeledValue label="売上税額" value={formatNumber(row.outputTax)} />
            <LabeledValue label="仕入税額" value={formatNumber(row.inputTax)} />
            <LabeledValue label="納付税額" value={formatNumber(row.payable)} strong />
          </View>
        ))}
      </View>
      <AppText size="xs" tone="muted">
        ※ 仕入税額は経費からの概算です（正式には請求書・インボイスで確定）。
        2割特例・簡易課税の適用可否は基準期間の課税売上や届出状況など要件確認が必要です。
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  bars: { gap: space.sm },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  barLabel: { width: 132 },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.hover,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: radius.pill },
  barAmount: { width: 96, textAlign: "right" },
  table: { gap: space.sm },
});
