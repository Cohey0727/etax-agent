import {
  DEPRECIATION_METHOD_LABELS,
  disposedYearOf,
  fixedAssetIncomeTypeLabel,
  fixedAssetYearFigures,
} from "@etax/shared";
import { Image, StyleSheet, View } from "react-native";
import { FixedAssetImageRecord, FixedAssetRecord, imageSource } from "@/api";
import { AppText, BouncePressable, Card, Chip, LabeledValue } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatDate, formatYen } from "@/utils";

export interface FixedAssetListProps {
  assets: FixedAssetRecord[];
  year: number;
  images: Record<number, FixedAssetImageRecord[]>;
  onSelect: (assetId: number) => void;
}

/** 資産カードの一覧。サムネイル・償却の進み具合・当年の償却費を1枚に集約する。 */
export function FixedAssetList({ assets, year, images, onSelect }: FixedAssetListProps) {
  return (
    <View style={styles.list}>
      {assets.map((asset, index) => {
        const firstImage = images[asset.id]?.[0];
        const disposedYear = disposedYearOf(asset);
        const figures = fixedAssetYearFigures(asset, year);
        const progress = Math.round(figures.progress * 100);
        return (
          <BouncePressable
            key={asset.id}
            accessibilityRole="button"
            accessibilityLabel={asset.name}
            onPress={() => onSelect(asset.id)}
          >
            <Card index={index + 1}>
              <View style={styles.header}>
                {firstImage ? (
                  <Image source={imageSource(firstImage.url)} style={styles.thumb} />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <AppText size="xl" tone="muted">
                      ▦
                    </AppText>
                  </View>
                )}
                <View style={styles.headerTexts}>
                  <AppText size="lg" weight="bold">
                    {asset.name}
                  </AppText>
                  <View style={styles.chips}>
                    <Chip label={fixedAssetIncomeTypeLabel(asset.income_type)} />
                    <Chip label={DEPRECIATION_METHOD_LABELS[asset.method].short} tone="accent" />
                    {disposedYear !== null ? (
                      <Chip label={`除却済み（${formatDate(asset.disposed_date)}）`} tone="warn" />
                    ) : null}
                  </View>
                </View>
              </View>
              <LabeledValue label="取得価額" value={formatYen(asset.cost)} />
              <LabeledValue
                label={`${year}年の償却費 / 年末残高`}
                value={`${formatYen(figures.deductible)} / ${formatYen(figures.bookValue)}`}
              />
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress}%` }]} />
              </View>
              <View style={styles.footer}>
                <AppText size="xs" tone="muted">
                  {formatDate(asset.acquisition_date)} 取得・耐用年数{asset.useful_life_years}年
                </AppText>
                <AppText size="xs" tone="muted">
                  償却 {progress}%
                </AppText>
              </View>
            </Card>
          </BouncePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  header: { flexDirection: "row", gap: space.md },
  thumb: { borderRadius: radius.md, height: 64, width: 64 },
  thumbPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.hover,
    borderRadius: radius.md,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  headerTexts: { flex: 1, gap: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  track: {
    backgroundColor: colors.lineSoft,
    borderRadius: radius.pill,
    height: 6,
    overflow: "hidden",
  },
  fill: { backgroundColor: colors.accent, height: "100%" },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
});
