import { MiscIncomeInput } from "@etax/shared";
import { Card, Col, Row, Text } from "@components/atoms";
import { LabeledAmountField } from "@components/molecules/LabeledAmountField";
import styles from "./MiscIncomePanel.css";

export interface MiscIncomePanelProps {
  miscIncome: MiscIncomeInput;
  onChange: (next: MiscIncomeInput) => void;
}

/**
 * 雑所得の入力。帳簿は事業・不動産しか持たないため、帳簿に載らない所得は
 * ここで入れる。第一表の「雑」欄（公的年金等・業務・その他）に対応し、
 * 合計所得と税額計算に含まれる。公的年金等の所得金額は、収入金額と
 * 65歳以上かどうかから公的年金等控除を引いて自動計算する。業務・その他は
 * 所得金額（必要経費を引いた後の金額）を入力する。
 */
export const MiscIncomePanel = ({ miscIncome, onChange }: MiscIncomePanelProps) => {
  const set = (patch: Partial<MiscIncomeInput>) => onChange({ ...miscIncome, ...patch });

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">雑所得</Text>
          <Text variant="muted">
            帳簿（事業・不動産）に載らない雑所得を、公的年金等・業務・その他の
            区分ごとに入力します。
          </Text>
        </Col>
        <Text variant="sectionTitle">公的年金等</Text>
        <LabeledAmountField
          label="公的年金等の収入金額"
          value={miscIncome.pensionRevenue}
          onChange={(v) => set({ pensionRevenue: v })}
        />
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">年齢区分</Text>
          </div>
          <label>
            <Row gap="sm" align="center">
              <input
                type="checkbox"
                checked={miscIncome.pensionOver65}
                onChange={(e) => set({ pensionOver65: e.target.checked })}
                aria-label="65歳以上"
              />
              <Text variant="muted">その年の12月31日時点で65歳以上（所得金額は公的年金等控除を引いて自動計算）</Text>
            </Row>
          </label>
        </Row>
        <Text variant="sectionTitle">業務</Text>
        <Text variant="muted">
          副業など、営利を目的とした継続的な業務に係る雑所得です。
        </Text>
        <LabeledAmountField
          label="業務の収入金額"
          value={miscIncome.businessRevenue}
          onChange={(v) => set({ businessRevenue: v })}
        />
        <LabeledAmountField
          label="業務の所得金額（必要経費を引いた後）"
          value={miscIncome.businessIncome}
          onChange={(v) => set({ businessIncome: v })}
        />
        <LabeledAmountField
          label="業務区分（申告書「キ」の区分番号。現金主義の特例は 1、なければ 0）"
          value={miscIncome.businessKubun}
          onChange={(v) => set({ businessKubun: v })}
        />
        <Text variant="sectionTitle">その他</Text>
        <Text variant="muted">
          仮想通貨の売却益など、上記以外の雑所得です。
        </Text>
        <LabeledAmountField
          label="その他の収入金額"
          value={miscIncome.revenue}
          onChange={(v) => set({ revenue: v })}
        />
        <LabeledAmountField
          label="その他の所得金額（必要経費を引いた後）"
          value={miscIncome.income}
          onChange={(v) => set({ income: v })}
        />
        <LabeledAmountField
          label="その他区分（申告書「ク」の区分番号。なければ 0）"
          value={miscIncome.kubun}
          onChange={(v) => set({ kubun: v })}
        />
      </Col>
    </Card>
  );
};
