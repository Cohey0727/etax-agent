import { useState } from "react";
import { Icon, Text } from "@components/atoms";
import styles from "./MultiSelectFilter.css";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectFilterProps {
  options: readonly MultiSelectOption[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  /** 未選択のときにトグルへ出す文言（未選択＝すべて、の意味）。 */
  placeholder?: string;
}

/**
 * 複数選択のフィルター入力。選択中の値はチップ（×で個別に外せる）で出し、
 * トグルを開くとチェックボックス付きの選択肢リストを出す。
 * 未選択は「すべて」を意味する。
 */
export const MultiSelectFilter = ({
  options,
  values,
  onChange,
  ariaLabel,
  placeholder = "すべて",
}: MultiSelectFilterProps) => {
  const [open, setOpen] = useState(false);
  const labelOf = (value: string): string =>
    options.find((option) => option.value === value)?.label ?? value;
  const toggleValue = (value: string) => {
    onChange(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value],
    );
  };
  return (
    <div className={styles.wrap}>
      <div className={styles.selectedRow}>
        {values.map((value) => (
          <span key={value} className={styles.valueChip}>
            {labelOf(value)}
            <button
              type="button"
              className={styles.valueRemove}
              onClick={() => toggleValue(value)}
              aria-label={`${labelOf(value)}を外す`}
            >
              <Icon name="close" size={10} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
        >
          <Icon name={values.length === 0 ? "chevronDown" : "plus"} size={12} />
          {values.length === 0 ? placeholder : "追加"}
        </button>
      </div>
      {open ? (
        <>
          <button
            type="button"
            className={styles.overlay}
            onClick={() => setOpen(false)}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className={styles.panel} role="listbox" aria-label={ariaLabel}>
            {options.map((option) => (
              <label key={option.value} className={styles.optionRow}>
                <input
                  type="checkbox"
                  checked={values.includes(option.value)}
                  onChange={() => toggleValue(option.value)}
                />
                <Text variant="body">{option.label}</Text>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};
