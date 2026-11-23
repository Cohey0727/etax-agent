import { MiscIncomeInput } from "@etax/shared";
import { Card, Col, Input, Row, Text } from "@components/atoms";
import styles from "./MiscIncomePanel.css";

export interface MiscIncomePanelProps {
  miscIncome: MiscIncomeInput;
  onChange: (next: MiscIncomeInput) => void;
}

/**
 * 雑所得（その他）の入力。帳簿は事業・不動産しか持たないため、仮想通貨の
 * 売却益など帳簿に載らない所得はここで入れる。第一表の「雑・その他」
 * （収入金額ク・所得金額⑨）に対応し、合計所得と税額計算に含まれる。
 */
export const MiscIncomePanel = ({ miscIncome, onChange }: MiscIncomePanelProps) => {
  const set = (patch: Partial<MiscIncomeInput>) => onChange({ ...miscIncome, ...patch });

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">雑所得（その他）</Text>
          <Text variant="muted">
            帳簿（事業・不動産）に載らない雑所得を入力します。仮想通貨の売却益など、
            収入金額と所得金額（必要経費を引いた後の金額）を入れてください。
          </Text>
        </Col>
        <AmountField
          label="収入金額"
          value={miscIncome.revenue}
          onChange={(v) => set({ revenue: v })}
        />
        <AmountField
          label="所得金額（必要経費を引いた後）"
          value={miscIncome.income}
          onChange={(v) => set({ income: v })}
        />
        <AmountField
          label="その他区分（申告書「ク」の区分番号。なければ 0）"
          value={miscIncome.kubun}
          onChange={(v) => set({ kubun: v })}
        />
      </Col>
    </Card>
  );
};

interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

const AmountField = ({ label, value, onChange }: AmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="number"
      value={value}
      onChange={(e) => onChange(toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

/** 金額入力の文字列を数値へ寄せる（空・不正は 0）。 */
function toAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
