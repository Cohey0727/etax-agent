import {
  ExpandedIncomeBreakdown,
  IncomeTaxResult,
  SpecialAccountInput,
  StockTransferCategoryInput,
  StockTransferInput,
} from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppButton, AppText, Card, Field } from "@/components";
import { space } from "@/theme";
import { formatYen } from "@/utils";
import { AmountField, ResultRow, SectionHead } from "../fields";

export interface StockTransferFieldsProps {
  stocks: StockTransferInput;
  breakdown: ExpandedIncomeBreakdown;
  taxResult: IncomeTaxResult;
  onChange: (next: StockTransferInput) => void;
}

const emptyAccount: SpecialAccountInput = {
  brokerName: "",
  branchName: "",
  withholdingAccount: true,
  revenue: 0,
  cost: 0,
  withholding: 0,
};

/**
 * 株式等譲渡の入力。一般株式等と上場株式等は区分ごとに計算し、特定口座
 * （源泉徴収口座）の明細は上場株式等へ合算する。上場の譲渡損失は
 * 申告分離課税を選んだ上場配当とだけ損益通算できる。
 * 譲渡損失の翌年への繰越控除は対象外。
 */
export function StockTransferFields({
  stocks,
  breakdown,
  taxResult,
  onChange,
}: StockTransferFieldsProps) {
  const setCategory = (key: "general" | "listed", patch: Partial<StockTransferCategoryInput>) =>
    onChange({ ...stocks, [key]: { ...stocks[key], ...patch } });
  const setAccount = (index: number, patch: Partial<SpecialAccountInput>) =>
    onChange({
      ...stocks,
      specialAccounts: stocks.specialAccounts.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    });
  const addAccount = () =>
    onChange({ ...stocks, specialAccounts: [...stocks.specialAccounts, { ...emptyAccount }] });
  const removeAccount = (index: number) =>
    onChange({ ...stocks, specialAccounts: stocks.specialAccounts.filter((_, i) => i !== index) });

  const s = breakdown.stocks;
  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="株式等譲渡"
          description="一般株式等と上場株式等は区分ごとに計算します（赤字と黒字は区分をまたいで通算しません）。特定口座（源泉徴収あり）の明細は上場株式等へ合算します。申告不要の口座は入力しないでください。"
        />

        <SectionHead title="一般株式等" />
        <CategoryFields
          category={stocks.general}
          onPatch={(patch) => setCategory("general", patch)}
        />
        <ResultRow label="一般株式等の所得金額" value={s.general.income} />

        <SectionHead title="上場株式等（特定口座以外）" />
        <CategoryFields category={stocks.listed} onPatch={(patch) => setCategory("listed", patch)} />
        <AmountField
          label="上場株式等（特定口座以外）の源泉徴収税額"
          value={stocks.listedWithholding}
          onChange={(v) => onChange({ ...stocks, listedWithholding: v })}
        />

        <SectionHead
          title="特定口座（源泉徴収口座）の明細"
          description="年間取引報告書の口座ごとに、譲渡の対価の額・取得費等・源泉徴収税額を入力します。計算明細書（KOC080）の2面に載ります（5口座まで）。"
        />
        {stocks.specialAccounts.map((account, index) => (
          <View key={index} style={styles.account}>
            <View style={styles.accountHead}>
              <AppText size="md" weight="semibold">
                口座 {index + 1}
              </AppText>
              <AppButton
                label="削除"
                variant="ghost"
                size="sm"
                onPress={() => removeAccount(index)}
              />
            </View>
            <Field
              label="金融商品取引業者等の名称"
              value={account.brokerName}
              onChangeText={(v) => setAccount(index, { brokerName: v })}
            />
            <Field
              label="支店名"
              value={account.branchName}
              onChangeText={(v) => setAccount(index, { branchName: v })}
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
          </View>
        ))}
        <AppButton label="口座を追加" variant="ghost" size="sm" onPress={addAccount} />
        <ResultRow
          label="上場株式等の所得金額（特定口座分を含む）"
          value={s.listed.income}
        />

        <SectionHead title="損益通算・分離課税" />
        <ResultRow
          label="上場の譲渡損失と上場配当（申告分離）との損益通算額"
          value={breakdown.listedLossOffsetToDividend}
        />
        <ResultRow
          label="株式等譲渡の申告分離課税の税額（15%）"
          value={taxResult.incomeTaxSeparateStocks}
        />
        <ResultRow
          label="上場配当の申告分離課税の税額（15%）"
          value={taxResult.incomeTaxSeparateDividends}
        />
        {breakdown.unabsorbedListedLoss > 0 ? (
          <AppText size="sm" tone="muted">
            {`損益通算しきれない上場株式等の譲渡損失 ${formatYen(breakdown.unabsorbedListedLoss)} があります。翌年以降への繰越控除（専用付表の連続提出が必要）はこの画面では未対応です。`}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

interface CategoryFieldsProps {
  category: StockTransferCategoryInput;
  onPatch: (patch: Partial<StockTransferCategoryInput>) => void;
}

/** 区分（一般／上場）共通の金額入力5項目。 */
function CategoryFields({ category, onPatch }: CategoryFieldsProps) {
  return (
    <>
      <AmountField
        label="譲渡による収入金額"
        value={category.revenue}
        onChange={(v) => onPatch({ revenue: v })}
      />
      <AmountField
        label="その他の収入金額"
        value={category.otherRevenue}
        onChange={(v) => onPatch({ otherRevenue: v })}
      />
      <AmountField
        label="取得費（取得価額）"
        value={category.acquisitionCost}
        onChange={(v) => onPatch({ acquisitionCost: v })}
      />
      <AmountField
        label="譲渡のための委託手数料"
        value={category.transferFees}
        onChange={(v) => onPatch({ transferFees: v })}
      />
      <AmountField
        label="その他の費用"
        value={category.otherExpenses}
        onChange={(v) => onPatch({ otherExpenses: v })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  account: { gap: space.sm },
  accountHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
