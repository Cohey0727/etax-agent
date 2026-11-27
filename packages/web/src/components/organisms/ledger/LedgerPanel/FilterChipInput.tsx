import { Input, Select, Text } from "@components/atoms";
import { MultiSelectFilter } from "@components/molecules";
import { LedgerFilter } from "./ledgerFilters";
import {
  categoryOptionsWith,
  INCOME_TYPE_OPTIONS,
  inputNumberOrNull,
  TAX_CATEGORY_OPTIONS,
} from "./ledgerOptions";
import styles from "./LedgerPanel.css";

export interface FilterChipInputProps {
  filter: LedgerFilter;
  /** 年度フィルターの選択肢（データにある割り当て年度）。 */
  years: readonly number[];
  /** データにある勘定科目（一覧に無い科目も選択肢に出す）。 */
  categories: readonly string[];
  onChange: (next: LedgerFilter) => void;
}

/** フィルター1件分の条件の入力欄（枠・項目名は持たない。チップや検索欄の横に置く）。 */
export const FilterChipInput = ({ filter, years, categories, onChange }: FilterChipInputProps) => {
  switch (filter.field) {
    case "year":
      return (
        <Select
          className={styles.chipSelect}
          value={filter.value ?? ""}
          onChange={(e) =>
            onChange({ ...filter, value: e.target.value === "" ? null : Number(e.target.value) })
          }
          aria-label="年度で絞り込み"
        >
          <option value="">全年度</option>
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}年
            </option>
          ))}
          {filter.value !== null && !years.includes(filter.value) ? (
            <option value={filter.value}>{filter.value}年</option>
          ) : null}
        </Select>
      );
    case "period":
      return (
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
      );
    case "amount":
      return (
        <>
          <Input
            type="number"
            className={styles.chipNumber}
            value={filter.min ?? ""}
            onChange={(e) =>
              onChange({ ...filter, min: inputNumberOrNull(e.target.valueAsNumber) })
            }
            placeholder="最小"
            aria-label="金額（最小・符号付き）"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="number"
            className={styles.chipNumber}
            value={filter.max ?? ""}
            onChange={(e) =>
              onChange({ ...filter, max: inputNumberOrNull(e.target.valueAsNumber) })
            }
            placeholder="最大"
            aria-label="金額（最大・符号付き）"
          />
          <Text variant="muted">円</Text>
        </>
      );
    case "category":
      return (
        <MultiSelectFilter
          ariaLabel="勘定科目で絞り込み"
          options={categoryOptionsWith([...categories, ...filter.values]).map((name) => ({
            value: name,
            label: name,
          }))}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      );
    case "incomeType":
      return (
        <MultiSelectFilter
          ariaLabel="区分で絞り込み"
          options={INCOME_TYPE_OPTIONS}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      );
    case "taxCategory":
      return (
        <MultiSelectFilter
          ariaLabel="税区分で絞り込み"
          options={TAX_CATEGORY_OPTIONS}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      );
    case "mismatch":
      return null;
    default:
      return filter satisfies never;
  }
};
