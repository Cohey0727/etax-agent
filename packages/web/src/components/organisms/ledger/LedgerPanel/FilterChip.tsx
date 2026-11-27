import { Icon, Text } from "@components/atoms";
import { FilterChipInput, FilterChipInputProps } from "./FilterChipInput";
import { FILTER_FIELD_LABELS } from "./ledgerFilters";
import styles from "./LedgerPanel.css";

export interface FilterChipProps extends FilterChipInputProps {
  /** 削除ボタン。無いフィルター（期間）は常設なので渡さない。 */
  onRemove?: () => void;
}

/** フィルター1件分のチップ。項目名＋条件の入力＋削除ボタンで構成する。 */
export const FilterChip = ({ onRemove, ...inputProps }: FilterChipProps) => {
  const { field } = inputProps.filter;
  return (
    <div className={styles.filterChip}>
      <Text variant="caption">{FILTER_FIELD_LABELS[field]}</Text>
      <FilterChipInput {...inputProps} />
      {onRemove ? (
        <button
          type="button"
          className={styles.chipRemove}
          onClick={onRemove}
          aria-label={`${FILTER_FIELD_LABELS[field]}フィルターを削除`}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
};
