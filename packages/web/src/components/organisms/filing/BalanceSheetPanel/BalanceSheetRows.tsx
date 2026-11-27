import { BalanceSheetWireExtra } from "@etax/shared";
import { Input, Text } from "@components/atoms";
import { formatYen } from "@utils";
import { toAmount } from "@utils/amountInput";
import styles from "./BalanceSheetPanel.css";

export interface AmountRowProps {
  label: string;
  /** 期首の金額。null の行は期首欄が無い（事業主貸・事業主借）。 */
  opening: number | null;
  closing: number;
  onOpening?: (value: number) => void;
  onClosing: (value: number) => void;
}

/** 科目1行（期首・期末の金額入力）。 */
export const AmountRow = ({ label, opening, closing, onOpening, onClosing }: AmountRowProps) => (
  <div className={styles.row}>
    <Text variant="muted">{label}</Text>
    {opening === null || !onOpening ? (
      <span className={styles.cell}>―</span>
    ) : (
      <Input
        className={styles.amountInput}
        type="number"
        value={opening}
        onChange={(e) => onOpening(toAmount(e.target.value))}
        aria-label={`${label}（期首）`}
      />
    )}
    <Input
      className={styles.amountInput}
      type="number"
      value={closing}
      onChange={(e) => onClosing(toAmount(e.target.value))}
      aria-label={`${label}（期末）`}
    />
  </div>
);

export interface ExtraRowProps {
  nameLabel: string;
  value: BalanceSheetWireExtra;
  onChange: (next: BalanceSheetWireExtra) => void;
}

/** 自由追加の科目1行（科目名＋期首・期末の金額入力）。 */
export const ExtraRow = ({ nameLabel, value, onChange }: ExtraRowProps) => (
  <div className={styles.row}>
    <Input
      value={value.name}
      placeholder={nameLabel}
      onChange={(e) => onChange({ ...value, name: e.target.value })}
      aria-label={`${nameLabel}の科目名`}
    />
    <Input
      className={styles.amountInput}
      type="number"
      value={value.opening}
      onChange={(e) => onChange({ ...value, opening: toAmount(e.target.value) })}
      aria-label={`${nameLabel}（期首）`}
    />
    <Input
      className={styles.amountInput}
      type="number"
      value={value.closing}
      onChange={(e) => onChange({ ...value, closing: toAmount(e.target.value) })}
      aria-label={`${nameLabel}（期末）`}
    />
  </div>
);

/** 合計行（表示のみ）。 */
export const TotalRow = ({
  label,
  opening,
  closing,
}: {
  label: string;
  opening: number;
  closing: number;
}) => (
  <div className={`${styles.row} ${styles.totalRow}`}>
    <span>{label}</span>
    <span className={styles.cell}>{formatYen(opening)}</span>
    <span className={styles.cell}>{formatYen(closing)}</span>
  </div>
);
