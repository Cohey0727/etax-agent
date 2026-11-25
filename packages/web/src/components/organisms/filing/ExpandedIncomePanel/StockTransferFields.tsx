import {
  ExpandedIncomeBreakdown,
  IncomeTaxResult,
  SpecialAccountInput,
  StockTransferCategoryInput,
  StockTransferInput,
} from "@etax/shared";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import { AmountField, ResultRow, TextField } from "./fields";

export interface StockTransferFieldsProps {
  stocks: StockTransferInput;
  breakdown: ExpandedIncomeBreakdown;
  taxResult: IncomeTaxResult;
  onChange: (next: StockTransferInput) => void;
}

const EMPTY_ACCOUNT: SpecialAccountInput = {
  brokerName: "",
  branchName: "",
  withholdingAccount: true,
  revenue: 0,
  cost: 0,
  withholding: 0,
};

/**
 * 株式等譲渡の入力（Issue #27 Phase C）。一般株式等と上場株式等は
 * 区分ごとに計算し、特定口座（源泉徴収口座）の明細は上場株式等へ
 * 合算する。上場の譲渡損失は申告分離課税を選んだ上場配当とだけ
 * 損益通算できる。譲渡損失の翌年への繰越控除は対象外。
 */
export const StockTransferFields = ({ stocks, breakdown, taxResult, onChange }: StockTransferFieldsProps) => {
  const setCategory = (key: "general" | "listed", patch: Partial<StockTransferCategoryInput>) =>
    onChange({ ...stocks, [key]: { ...stocks[key], ...patch } });
  const setAccount = (index: number, patch: Partial<SpecialAccountInput>) =>
    onChange({
      ...stocks,
      specialAccounts: stocks.specialAccounts.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    });
  const addAccount = () => onChange({ ...stocks, specialAccounts: [...stocks.specialAccounts, { ...EMPTY_ACCOUNT }] });
  const removeAccount = (index: number) =>
    onChange({ ...stocks, specialAccounts: stocks.specialAccounts.filter((_, i) => i !== index) });

  const s = breakdown.stocks;
  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">株式等譲渡</Text>
          <Text variant="muted">
            一般株式等と上場株式等は区分ごとに計算します（赤字と黒字は区分を
            またいで通算しません）。特定口座（源泉徴収あり）の明細は上場株式等へ
            合算します。申告不要の口座は入力しないでください。
          </Text>
        </Col>

        <Text variant="sectionTitle">一般株式等</Text>
        <CategoryFields
          category={stocks.general}
          onPatch={(patch) => setCategory("general", patch)}
        />
        <ResultRow label="一般株式等の所得金額" value={formatYen(s.general.income)} />

        <Text variant="sectionTitle">上場株式等（特定口座以外）</Text>
        <CategoryFields
          category={stocks.listed}
          onPatch={(patch) => setCategory("listed", patch)}
        />
        <AmountField
          label="上場株式等（特定口座以外）の源泉徴収税額"
          value={stocks.listedWithholding}
          onChange={(v) => onChange({ ...stocks, listedWithholding: v })}
        />

        <Text variant="sectionTitle">特定口座（源泉徴収口座）の明細</Text>
        <Text variant="muted">
          年間取引報告書の口座ごとに、譲渡の対価の額・取得費等・源泉徴収税額を
          入力します。計算明細書（KOC080）の2面に載ります（5口座まで）。
        </Text>
        {stocks.specialAccounts.map((account, index) => (
          <Col key={index} gap="sm">
            <Row gap="sm" align="center">
              <Text variant="muted">{`口座 ${index + 1}`}</Text>
              <Button variant="ghost" size="sm" onClick={() => removeAccount(index)}>
                削除
              </Button>
            </Row>
            <TextField
              label="金融商品取引業者等の名称"
              value={account.brokerName}
              onChange={(v) => setAccount(index, { brokerName: v })}
            />
            <TextField
              label="支店名"
              value={account.branchName}
              onChange={(v) => setAccount(index, { branchName: v })}
            />
            <AmountField
              label="譲渡の対価の額"
              value={account.revenue}
              onChange={(v) => setAccount(index, { revenue: v })}
            />
            <AmountField
              label="取得費等"
              value={account.cost}
              onChange={(v) => setAccount(index, { cost: v })}
            />
            <AmountField
              label="源泉徴収税額"
              value={account.withholding}
              onChange={(v) => setAccount(index, { withholding: v })}
            />
          </Col>
        ))}
        <Row gap="sm">
          <Button variant="ghost" size="sm" onClick={addAccount}>
            口座を追加
          </Button>
        </Row>
        <ResultRow label="上場株式等の所得金額（特定口座分を含む）" value={formatYen(s.listed.income)} />

        <Text variant="sectionTitle">損益通算・分離課税</Text>
        <ResultRow
          label="上場の譲渡損失と上場配当（申告分離）との損益通算額"
          value={formatYen(breakdown.listedLossOffsetToDividend)}
        />
        <ResultRow label="株式等譲渡の申告分離課税の税額（15%）" value={formatYen(taxResult.incomeTaxSeparateStocks)} />
        <ResultRow label="上場配当の申告分離課税の税額（15%）" value={formatYen(taxResult.incomeTaxSeparateDividends)} />
        {breakdown.unabsorbedListedLoss > 0 ? (
          <Text variant="muted">
            {`損益通算しきれない上場株式等の譲渡損失 ${formatYen(breakdown.unabsorbedListedLoss)} があります。翌年以降への繰越控除（専用付表の連続提出が必要）はこの画面では未対応です。`}
          </Text>
        ) : null}
      </Col>
    </Card>
  );
};

interface CategoryFieldsProps {
  category: StockTransferCategoryInput;
  onPatch: (patch: Partial<StockTransferCategoryInput>) => void;
}

/** 区分（一般／上場）共通の金額入力5項目。 */
const CategoryFields = ({ category, onPatch }: CategoryFieldsProps) => (
  <>
    <AmountField label="譲渡による収入金額" value={category.revenue} onChange={(v) => onPatch({ revenue: v })} />
    <AmountField label="その他の収入金額" value={category.otherRevenue} onChange={(v) => onPatch({ otherRevenue: v })} />
    <AmountField label="取得費（取得価額）" value={category.acquisitionCost} onChange={(v) => onPatch({ acquisitionCost: v })} />
    <AmountField label="譲渡のための委託手数料" value={category.transferFees} onChange={(v) => onPatch({ transferFees: v })} />
    <AmountField label="その他の費用" value={category.otherExpenses} onChange={(v) => onPatch({ otherExpenses: v })} />
  </>
);
