import {
  IncomeTaxResult,
  TaxCreditBreakdown,
  TaxCreditInputs,
  flatReductionInputApplies,
} from "@etax/shared";
import { Card, Col, Row, Select, Text } from "@components/atoms";
import { LabeledAmountField } from "@components/molecules/LabeledAmountField";
import { formatNumber } from "@utils";
import styles from "./TaxCreditPanel.css";

/** 税額控除の内訳表示ラベル（エンジンの内訳キー → 正式名称）。 */
const CREDIT_LABELS: readonly { key: keyof TaxCreditBreakdown; label: string }[] = [
  { key: "housingLoan", label: "住宅借入金等特別控除" },
  { key: "flatReduction", label: "定額減税（令和6年分）" },
  { key: "dividend", label: "配当控除" },
  { key: "politicalDonations", label: "政党等寄附金特別控除" },
  { key: "certifiedNpoDonations", label: "認定NPO法人等寄附金特別控除" },
  { key: "seismicRetrofit", label: "住宅耐震改修特別控除" },
  { key: "foreignTax", label: "外国税額控除" },
];

export interface TaxCreditPanelProps {
  /** 選択中の年度（定額減税の入力は対象の年分だけ出す） */
  year: number;
  taxCredits: TaxCreditInputs;
  /** 所得税額の計算結果（税額控除の内訳と確定税額を含む） */
  result: IncomeTaxResult;
  /** 配当所得の入力がある場合、配当控除の対象額はそちらの内訳が優先する */
  dividendCreditDerived?: boolean;
  onChange: (next: TaxCreditInputs) => void;
}

export const TaxCreditPanel = ({
  year,
  taxCredits,
  result,
  dividendCreditDerived,
  onChange,
}: TaxCreditPanelProps) => {
  const set = (patch: Partial<TaxCreditInputs>) => onChange({ ...taxCredits, ...patch });
  const credits = result.taxCredits;

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">税額控除の入力と税額計算</Text>
          <Text variant="muted">
            住宅ローンの年末残高などを入れると税額控除が計算され、確定税額に
            反映されます。控除限度額は住宅の区分で決まります
            （認定住宅35万円・ZEH水準31.5万円・省エネ基準適合28万円・その他21万円など）。
          </Text>
        </Col>

        <Text className={styles.subhead}>住宅借入金等特別控除</Text>
        <LabeledAmountField
          label="住宅ローンの年末残高"
          value={taxCredits.housingLoanBalance}
          onChange={(v) => set({ housingLoanBalance: v })}
        />
        <LabeledAmountField
          label="控除限度額（住宅の区分に応じた上限）"
          value={taxCredits.housingLoanLimit}
          onChange={(v) => set({ housingLoanLimit: v })}
        />
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">控除率（居住年で決まります）</Text>
          </div>
          <Select
            value={String(taxCredits.housingLoanRate)}
            onChange={(e) => set({ housingLoanRate: Number(e.target.value) })}
          >
            <option value="0.007">0.7%（2022年以降に居住）</option>
            <option value="0.01">1%（2021年以前に居住）</option>
          </Select>
        </Row>

        {flatReductionInputApplies(year) ? (
          <>
            <Text className={styles.subhead}>定額減税（令和6年分のみ）</Text>
            <LabeledAmountField
              label="定額減税額（本人・配偶者・扶養親族の人数 × 30,000円）"
              value={taxCredits.flatReduction}
              onChange={(v) => set({ flatReduction: v })}
            />
          </>
        ) : null}

        <Text className={styles.subhead}>配当控除</Text>
        {dividendCreditDerived ? (
          <Text variant="muted">
            配当所得の入力があるため、配当控除の対象額は配当・一時所得パネルの
            内訳から自動で計算しています（下の手入力は使われません）。
          </Text>
        ) : null}
        <LabeledAmountField
          label="配当等の金額（剰余金の配当など・総合課税）"
          value={taxCredits.dividendCorporate}
          onChange={(v) => set({ dividendCorporate: v })}
        />
        <LabeledAmountField
          label="証券投資信託の収益の分配（総合課税）"
          value={taxCredits.dividendTrust}
          onChange={(v) => set({ dividendTrust: v })}
        />

        <Text className={styles.subhead}>寄附金の税額控除</Text>
        <LabeledAmountField
          label="政党等への寄附金"
          value={taxCredits.politicalDonations}
          onChange={(v) => set({ politicalDonations: v })}
        />
        <LabeledAmountField
          label="認定NPO法人・公益社団法人等への寄附金"
          value={taxCredits.certifiedNpoDonations}
          onChange={(v) => set({ certifiedNpoDonations: v })}
        />

        <Text className={styles.subhead}>住宅耐震改修特別控除</Text>
        <LabeledAmountField
          label="耐震改修の標準的な費用の額"
          value={taxCredits.seismicRetrofitStandardCost}
          onChange={(v) => set({ seismicRetrofitStandardCost: v })}
        />
        <LabeledAmountField
          label="その他の耐震工事に係る金額"
          value={taxCredits.seismicRetrofitOtherCost}
          onChange={(v) => set({ seismicRetrofitOtherCost: v })}
        />

        <Text className={styles.subhead}>外国税額控除</Text>
        <LabeledAmountField
          label="外国所得税の額"
          value={taxCredits.foreignTaxPaid}
          onChange={(v) => set({ foreignTaxPaid: v })}
        />
        <LabeledAmountField
          label="調整国外所得金額"
          value={taxCredits.foreignIncome}
          onChange={(v) => set({ foreignIncome: v })}
        />

        <Text className={styles.subhead}>税額計算（自動計算）</Text>
        <Col gap="sm">
          <SummaryRow label="合計所得金額" value={result.totalIncome} />
          <SummaryRow label="所得控除の合計" value={result.deductionsTotal} />
          <SummaryRow label="課税所得金額（1,000円未満切捨て）" value={result.taxableIncome} />
          <SummaryRow label="所得税額（税額控除前）" value={result.incomeTaxBase} />
          {CREDIT_LABELS.filter(({ key }) => credits[key] > 0).map(({ key, label }) => (
            <SummaryRow key={key} label={label} value={credits[key]} muted />
          ))}
          <SummaryRow label="税額控除の合計" value={result.taxCreditsTotal} />
          <SummaryRow label="復興特別所得税" value={result.reconstructionTax} />
          <Row gap="sm" justify="spaceBetween">
            <Text>確定税額（100円未満切捨て）</Text>
            <Text variant="statValue">{formatNumber(result.finalTax)}円</Text>
          </Row>
        </Col>
      </Col>
    </Card>
  );
};

interface SummaryRowProps {
  label: string;
  value: number;
  muted?: boolean;
}

const SummaryRow = ({ label, value, muted = false }: SummaryRowProps) => (
  <Row gap="sm" justify="spaceBetween">
    <Text variant="muted">{label}</Text>
    <Text variant={muted ? "muted" : "body"}>{formatNumber(value)}円</Text>
  </Row>
);
