import { ScrollView, StyleSheet, View } from "react-native";
import { AppText, BouncePressable, DateField, Field } from "@/components";
import { colors, radius, space } from "@/theme";
import { INCOME_TYPE_OPTIONS } from "../options";
import { LedgerFilters as LedgerFilterState } from "../LedgerScreen/useLedgerFilters";

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <BouncePressable
      onPress={onPress}
      pressScale={0.94}
      style={[styles.filterChip, active ? styles.filterChipActive : styles.filterChipIdle]}
    >
      <AppText
        numberOfLines={1}
        size="sm"
        weight="bold"
        style={{ color: active ? colors.onAccent : colors.textSubtle }}
      >
        {label}
      </AppText>
    </BouncePressable>
  );
}

const toggleValue = (values: string[], value: string): string[] =>
  values.includes(value) ? values.filter((x) => x !== value) : [...values, value];

export interface LedgerFiltersProps {
  filters: LedgerFilterState;
  onPatch: (patch: Partial<LedgerFilterState>) => void;
  /** その年度の取引に現れる勘定科目。 */
  categories: readonly string[];
  /** その年度の取引に現れる税区分。 */
  taxCategories: readonly string[];
}

/** 帳簿の検索・絞り込みUI（検索欄、科目・区分・収支チップ、期間、金額、税区分）。 */
export function LedgerFilters({ filters, onPatch, categories, taxCategories }: LedgerFiltersProps) {
  return (
    <>
      <Field
        label="検索"
        value={filters.query}
        onChangeText={(query) => onPatch({ query })}
        placeholder="摘要・勘定科目・出所・税区分で検索"
      />
      <View style={styles.group}>
        <AppText size="sm" weight="semibold" tone="subtle">
          勘定科目
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <FilterChip
              label="すべて"
              active={filters.categories.length === 0}
              onPress={() => onPatch({ categories: [] })}
            />
            {categories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={filters.categories.includes(c)}
                onPress={() => onPatch({ categories: toggleValue(filters.categories, c) })}
              />
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={styles.group}>
        <AppText size="sm" weight="semibold" tone="subtle">
          区分・収支
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <FilterChip
              label="すべての区分"
              active={filters.incomeType === "すべて"}
              onPress={() => onPatch({ incomeType: "すべて" })}
            />
            {INCOME_TYPE_OPTIONS.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                active={filters.incomeType === o.value}
                onPress={() => onPatch({ incomeType: o.value })}
              />
            ))}
            {["すべて", "収入", "支出"].map((s) => (
              <FilterChip
                key={s}
                label={s === "すべて" ? "収支すべて" : s}
                active={filters.sign === s}
                onPress={() => onPatch({ sign: s })}
              />
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <DateField
            label="期間（から）"
            clearable
            value={filters.periodFrom}
            onChange={(periodFrom) => onPatch({ periodFrom })}
          />
        </View>
        <View style={styles.pairCell}>
          <DateField
            label="期間（まで）"
            clearable
            value={filters.periodTo}
            onChange={(periodTo) => onPatch({ periodTo })}
          />
        </View>
      </View>
      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <Field
            label="金額（下限・円）"
            value={filters.amountMin}
            onChangeText={(amountMin) => onPatch({ amountMin })}
            keyboardType="numbers-and-punctuation"
            inputMode="decimal"
            placeholder="例: -10000"
          />
        </View>
        <View style={styles.pairCell}>
          <Field
            label="金額（上限・円）"
            value={filters.amountMax}
            onChangeText={(amountMax) => onPatch({ amountMax })}
            keyboardType="numbers-and-punctuation"
            inputMode="decimal"
            placeholder="例: 100000"
          />
        </View>
      </View>
      <View style={styles.group}>
        <AppText size="sm" weight="semibold" tone="subtle">
          税区分
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <FilterChip
              label="すべて"
              active={filters.taxCategories.length === 0}
              onPress={() => onPatch({ taxCategories: [] })}
            />
            {taxCategories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={filters.taxCategories.includes(c)}
                onPress={() => onPatch({ taxCategories: toggleValue(filters.taxCategories, c) })}
              />
            ))}
            <FilterChip
              label="税区分の符号不一致"
              active={filters.mismatchOnly}
              onPress={() => onPatch({ mismatchOnly: !filters.mismatchOnly })}
            />
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  chipRow: { flexDirection: "row", gap: 6 },
  pairRow: { flexDirection: "row", gap: space.sm },
  pairCell: { flex: 1 },
  filterChip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipIdle: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
});
