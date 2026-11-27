import {
  DividendIncomeInput,
  ExpandedIncomeBreakdown,
  ExpandedIncomeInput,
  IncomeTaxResult,
  ListedDividendMode,
  TempIncomeInput,
} from "@etax/shared";
import { Card, Col, Row, Select, Text } from "@components/atoms";
import { LabeledAmountField } from "@components/molecules/LabeledAmountField";
import { ResultRow } from "./fields";
import { StockTransferFields } from "./StockTransferFields";
import styles from "./ExpandedIncomePanel.css";

export interface ExpandedIncomePanelProps {
  expandedIncome: ExpandedIncomeInput;
  /** 拡張所得の計算内訳（申告ワークスペースで計算したもの） */
  breakdown: ExpandedIncomeBreakdown;
  /** 所得税の計算結果（分離課税の税額表示用） */
  taxResult: IncomeTaxResult;
  onChange: (next: ExpandedIncomeInput) => void;
}

/** 上場配当等の課税方式の選択肢（値は shared の ListedDividendMode）。 */
const LISTED_MODE_OPTIONS: { value: ListedDividendMode; label: string }[] = [
  { value: "comprehensive", label: "総合課税（配当控除あり）" },
  { value: "separate", label: "申告分離課税（上場の譲渡損失と損益通算可）" },
  { value: "none", label: "申告不要（源泉徴収のみで完結）" },
];

/**
 * 配当・一時・株式等譲渡の入力。帳簿に載らない
 * 所得をここで入れ、合計所得・分離課税・XTX（第一表・第三表・計算明細書）
 * へ反映する。対象外の所得（土地建物等の譲渡・退職・山林・先物取引・
 * 譲渡損失の繰越控除）は画面に明示し、入力欄は置かない。
 */
export const ExpandedIncomePanel = ({ expandedIncome, breakdown, taxResult, onChange }: ExpandedIncomePanelProps) => {
  const setTemp = (patch: Partial<TempIncomeInput>) =>
    onChange({ ...expandedIncome, temp: { ...expandedIncome.temp, ...patch } });
  const setDividend = (patch: Partial<DividendIncomeInput>) =>
    onChange({ ...expandedIncome, dividend: { ...expandedIncome.dividend, ...patch } });

  const d = breakdown.dividend;
  return (
    <>
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="sectionTitle">配当・一時所得</Text>
            <Text variant="muted">
              帳簿（事業・不動産）に載らない配当所得と一時所得を入力します。
              株式等譲渡は下のカードで入力します。土地建物等の譲渡所得・
              退職所得・山林所得・先物取引に係る雑所得等、譲渡損失の繰越控除は
              対象外です。
            </Text>
          </Col>

          <Text variant="sectionTitle">一時所得</Text>
          <Text variant="muted">
            懸賞金・競馬等の払戻金・生命保険の一時金など。特別控除50万円を
            引いた金額の2分の1が総合課税の所得に算入されます。
          </Text>
          <LabeledAmountField
            label="一時所得の収入金額"
            value={expandedIncome.temp.revenue}
            onChange={(v) => setTemp({ revenue: v })}
          />
          <LabeledAmountField
            label="収入を得るために支出した金額"
            value={expandedIncome.temp.expenses}
            onChange={(v) => setTemp({ expenses: v })}
          />
          <ResultRow label="一時所得の金額（特別控除後）" amount={breakdown.temp.amount} />
          <ResultRow label="総合課税への算入額（2分の1）" amount={breakdown.temp.includedAmount} />

          <Text variant="sectionTitle">配当所得</Text>
          <Row gap="sm">
            <div className={styles.fieldLabel}>
              <Text variant="muted">上場株式等の配当等の課税方式</Text>
            </div>
            <Select
              className={styles.fieldText}
              value={expandedIncome.dividend.listedMode}
              onChange={(e) => setDividend({ listedMode: e.target.value as ListedDividendMode })}
              aria-label="上場株式等の配当等の課税方式"
            >
              {LISTED_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Row>
          <Text variant="muted">
            課税方式は上場配当等の全額に適用します（口座ごとの選択はできません）。
            配当控除は、配当を入力した場合はこの内訳から自動で計算し、
            税額控除パネルの配当控除の手入力より優先します。源泉徴収税額は
            提出パネルの源泉徴収税額へ自動で加算されます。
          </Text>
          <LabeledAmountField
            label="上場株式等の配当等の収入金額"
            value={expandedIncome.dividend.listedRevenue}
            onChange={(v) => setDividend({ listedRevenue: v })}
          />
          <LabeledAmountField
            label="うち証券投資信託の収益の分配"
            value={expandedIncome.dividend.listedTrustRevenue}
            onChange={(v) => setDividend({ listedTrustRevenue: v })}
          />
          <LabeledAmountField
            label="上場配当等の源泉徴収税額"
            value={expandedIncome.dividend.listedWithholding}
            onChange={(v) => setDividend({ listedWithholding: v })}
          />
          <LabeledAmountField
            label="一般の配当等（非上場）の収入金額"
            value={expandedIncome.dividend.generalRevenue}
            onChange={(v) => setDividend({ generalRevenue: v })}
          />
          <LabeledAmountField
            label="うち証券投資信託の収益の分配"
            value={expandedIncome.dividend.generalTrustRevenue}
            onChange={(v) => setDividend({ generalTrustRevenue: v })}
          />
          <LabeledAmountField
            label="一般の配当等の源泉徴収税額"
            value={expandedIncome.dividend.generalWithholding}
            onChange={(v) => setDividend({ generalWithholding: v })}
          />
          <LabeledAmountField
            label="配当を得るために要した負債の利子"
            value={expandedIncome.dividend.interestExpense}
            onChange={(v) => setDividend({ interestExpense: v })}
          />
          <ResultRow label="配当所得の金額（総合課税分）" amount={d.comprehensiveIncome} />
          <ResultRow label="配当等の金額（申告分離課税分）" amount={breakdown.separateDividendIncome} />
        </Col>
      </Card>
      <StockTransferFields
        stocks={expandedIncome.stocks}
        breakdown={breakdown}
        taxResult={taxResult}
        onChange={(stocks) => onChange({ ...expandedIncome, stocks })}
      />
    </>
  );
};
