import { Icon, Input, Select, Text } from "@components/atoms";
import { MultiSelectFilter } from "@components/molecules";
import { FILTER_FIELD_LABELS, LedgerFilter } from "./ledgerFilters";
import { categoryOptionsWith, INCOME_TYPE_OPTIONS, TAX_CATEGORY_OPTIONS } from "./ledgerOptions";
import styles from "./LedgerPanel.css";

/** フィルター1件分のチップ。項目名＋条件の入力＋削除ボタンで構成する。 */
export const FilterChip = ({
  filter,
  years,
  categories,
  onChange,
  onRemove,
  bare = false,
}: {
  filter: LedgerFilter;
  /** 年度フィルターの選択肢（データにある割り当て年度）。 */
  years: readonly number[];
  /** データにある勘定科目（一覧に無い科目も選択肢に出す）。 */
  categories: readonly string[];
  onChange: (next: LedgerFilter) => void;
  /** 削除ボタン。無いフィルター（期間）は常設なので渡さない。 */
  onRemove?: () => void;
  /** 枠もラベルも付けない（検索の左に置く期間フィルター用）。 */
  bare?: boolean;
}) => {
  return (
    <div className={bare ? styles.filterBare : styles.filterChip}>
      {bare ? null : <Text variant="caption">{FILTER_FIELD_LABELS[filter.field]}</Text>}
      {filter.field === "year" ? (
        <Select
          className={styles.chipSelect}
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          aria-label="年度で絞り込み"
        >
          <option value="">全年度</option>
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}年
            </option>
          ))}
          {filter.value && !years.includes(Number(filter.value)) ? (
            <option value={filter.value}>{filter.value}年</option>
          ) : null}
        </Select>
      ) : filter.field === "period" ? (
        <>
          <Input
            type="date"
            className={styles.chipInput}
            value={filter.from}
            onChange={(e) => onChange({ ...filter, from: e.target.value })}
            aria-label="開始日"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="date"
            className={styles.chipInput}
            value={filter.to}
            onChange={(e) => onChange({ ...filter, to: e.target.value })}
            aria-label="終了日"
          />
        </>
      ) : filter.field === "amount" ? (
        <>
          <Input
            type="number"
            className={styles.chipNumber}
            value={filter.min}
            onChange={(e) => onChange({ ...filter, min: e.target.value })}
            placeholder="最小"
            aria-label="金額（最小・符号付き）"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="number"
            className={styles.chipNumber}
            value={filter.max}
            onChange={(e) => onChange({ ...filter, max: e.target.value })}
            placeholder="最大"
            aria-label="金額（最大・符号付き）"
          />
          <Text variant="muted">円</Text>
        </>
      ) : filter.field === "category" ? (
        <MultiSelectFilter
          ariaLabel="勘定科目で絞り込み"
          options={categoryOptionsWith([...categories, ...filter.values]).map((name) => ({
            value: name,
            label: name,
          }))}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      ) : filter.field === "incomeType" ? (
        <MultiSelectFilter
          ariaLabel="区分で絞り込み"
          options={INCOME_TYPE_OPTIONS}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      ) : filter.field === "mismatch" ? null : (
        <MultiSelectFilter
          ariaLabel="税区分で絞り込み"
          options={TAX_CATEGORY_OPTIONS}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      )}
      {onRemove ? (
        <button
          type="button"
          className={styles.chipRemove}
          onClick={onRemove}
          aria-label={`${FILTER_FIELD_LABELS[filter.field]}フィルターを削除`}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
};
