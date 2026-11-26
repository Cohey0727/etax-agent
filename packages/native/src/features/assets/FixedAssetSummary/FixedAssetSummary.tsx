import { StyleSheet, View } from "react-native";
import { DepreciationSummary, FixedAssetRecord } from "@/api";
import { AppText, Card, LabeledValue } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatYen } from "@/utils";
import { bookValueAt, disposedYearOf } from "../assetOptions";

export interface FixedAssetSummaryProps {
  assets: FixedAssetRecord[];
  summary: DepreciationSummary | null;
  year: number;
}

/** 対象年度のサマリ（件数・取得価額・所得区分別の償却費・期末簿価・少額特例の使用状況）。 */
export function FixedAssetSummary({ assets, summary, year }: FixedAssetSummaryProps) {
  const active = assets.filter((asset) => {
    const disposedYear = disposedYearOf(asset);
    return disposedYear === null || disposedYear >= year;
  });
  const disposedCount = assets.length - active.length;
  const totalCost = active.reduce((sum, asset) => sum + asset.cost, 0);
  // 償却累計額は取得価額合計から期末簿価を差し引いたもの。
  const totalBookValue = active.reduce((sum, asset) => sum + bookValueAt(asset, year), 0);
  const accumulated = totalCost - totalBookValue;
  const smallSpecial = summary?.small_special ?? null;
  const smallSpecialPercent = smallSpecial
    ? Math.min(100, (smallSpecial.total / smallSpecial.cap) * 100)
    : 0;

  return (
    <Card index={0}>
      <AppText size="lg" weight="bold">
        {year}年の償却サマリー
      </AppText>
      <LabeledValue
        label="資産件数"
        value={
          disposedCount > 0 ? `${active.length}件（除却済み${disposedCount}件）` : `${active.length}件`
        }
      />
      <LabeledValue label="取得価額 合計" value={formatYen(totalCost)} />
      <LabeledValue label="償却累計額" value={formatYen(accumulated)} />
      <LabeledValue label={`${year}年の償却費（事業）`} value={formatYen(summary?.deductible_totals.business ?? 0)} />
      <LabeledValue label={`${year}年の償却費（不動産）`} value={formatYen(summary?.deductible_totals.real_estate ?? 0)} />
      <LabeledValue label={`${year}年の償却費（農業）`} value={formatYen(summary?.deductible_totals.agriculture ?? 0)} />
      <LabeledValue label={`${year}年末の未償却残高（帳簿価額）`} value={formatYen(totalBookValue)} strong />
      {smallSpecial ? (
        <View style={styles.smallSpecial}>
          <AppText size="sm" weight="semibold" tone="subtle">
            少額減価償却資産の特例（{year}年取得分）
          </AppText>
          <AppText size="sm">
            {formatYen(smallSpecial.total)} / {formatYen(smallSpecial.cap)}
            {smallSpecial.exceeded ? "（上限を超過しています）" : ""}
          </AppText>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${smallSpecialPercent}%` },
                smallSpecial.exceeded ? styles.fillExceeded : null,
              ]}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  smallSpecial: { gap: space.xs, marginTop: space.sm },
  track: {
    backgroundColor: colors.lineSoft,
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden",
  },
  fill: { backgroundColor: colors.accent, height: "100%" },
  fillExceeded: { backgroundColor: colors.negative },
});
