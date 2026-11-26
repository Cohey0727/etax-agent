import {
  AGRICULTURE_EXPENSE_CATEGORIES,
  AgricultureInput,
  FilingType,
  agricultureIncomeBeforeBlueDeduction,
  computeAgricultureStatement,
} from "@etax/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppButton, AppText, Card, Field } from "@/components";
import { space } from "@/theme";
import { AmountField, MoneyInput, ResultRow, SectionHead } from "../fields";

export interface AgriculturePanelProps {
  agriculture: AgricultureInput;
  /** 申告の種類（青色は専従者給与・貸倒引当金、白色は専従者控除を表示する） */
  filingType: FilingType;
  onChange: (next: AgricultureInput) => void;
}

/**
 * 農業所得の入力。帳簿の取引とは混ぜず申告入力として保持し、農業所得用の
 * 決算書（青色は青色申告決算書（農業所得用）、白色は収支内訳書（農業所得用））と
 * 申告書の農業欄へ反映する。科目構成と計算は国税庁の農業所得用様式どおり
 * （shared の決定的計算）。
 * 収入金額の内訳・育成費用の計算・貸借対照表は対象外。
 */
export function AgriculturePanel({ agriculture, filingType, onChange }: AgriculturePanelProps) {
  const statement = useMemo(() => computeAgricultureStatement(agriculture), [agriculture]);
  const white = filingType === "white";
  const [extraName, setExtraName] = useState("");
  const [extraAmount, setExtraAmount] = useState(0);

  const set = (patch: Partial<AgricultureInput>) => onChange({ ...agriculture, ...patch });
  const setExpense = (category: string, value: number) => {
    const expenseTotals = { ...agriculture.expenseTotals };
    if (value === 0) delete expenseTotals[category];
    else expenseTotals[category] = value;
    set({ expenseTotals });
  };
  const extraCategories = Object.keys(agriculture.expenseTotals).filter(
    (category) => !AGRICULTURE_EXPENSE_CATEGORIES.includes(category),
  );
  const addExtra = () => {
    const name = extraName.trim();
    if (!name) return;
    setExpense(name, extraAmount);
    setExtraName("");
    setExtraAmount(0);
  };
  const incomeBeforeBlue = agricultureIncomeBeforeBlueDeduction(statement, white);

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="農業所得"
          description={`農業の収支は帳簿（事業・不動産）とは分けて、ここで入力します。${white ? "収支内訳書（農業所得用）" : "青色申告決算書（農業所得用）"}と申告書の事業（農業）欄に出力されます。収入金額の内訳・育成費用の計算・貸借対照表は未対応です。`}
        />

        <Field
          label="農園名"
          value={agriculture.farmName}
          onChangeText={(v) => set({ farmName: v })}
        />

        <SectionHead title="収入金額" />
        <AmountField
          label="販売金額"
          value={agriculture.salesAmount}
          onChange={(v) => set({ salesAmount: v })}
        />
        <AmountField
          label="家事消費・事業消費金額"
          value={agriculture.householdConsumption}
          onChange={(v) => set({ householdConsumption: v })}
        />
        <AmountField
          label="雑収入"
          value={agriculture.miscRevenue}
          onChange={(v) => set({ miscRevenue: v })}
        />
        <AmountField
          label="農産物の棚卸高（期首）"
          value={agriculture.produceOpeningInventory}
          onChange={(v) => set({ produceOpeningInventory: v })}
        />
        <AmountField
          label="農産物の棚卸高（期末）"
          value={agriculture.produceClosingInventory}
          onChange={(v) => set({ produceClosingInventory: v })}
        />
        <ResultRow label="収入金額の計" value={statement.revenueTotal} strong />

        <SectionHead title="経費" />
        {AGRICULTURE_EXPENSE_CATEGORIES.map((category) => (
          <AmountField
            key={category}
            label={category === "地代賃借料" && white ? "小作料・賃借料" : category}
            value={agriculture.expenseTotals[category] ?? 0}
            onChange={(v) => setExpense(category, v)}
          />
        ))}
        {extraCategories.map((category) => (
          <View key={category} style={styles.extraRow}>
            <View style={styles.extraMain}>
              <AppText size="sm" weight="semibold" tone="subtle">
                {category}（追加科目）
              </AppText>
              <MoneyInput
                accessibilityLabel={category}
                value={agriculture.expenseTotals[category] ?? 0}
                onChange={(v) => setExpense(category, v)}
              />
            </View>
            <AppButton
              label="削除"
              variant="ghost"
              size="sm"
              onPress={() => setExpense(category, 0)}
            />
          </View>
        ))}
        <View style={styles.addRow}>
          <AppText size="md" weight="bold">
            科目を追加
          </AppText>
          <Field
            label="科目名"
            value={extraName}
            onChangeText={setExtraName}
            placeholder="科目名"
          />
          <View style={styles.addAmount}>
            <AppText size="sm" weight="semibold" tone="subtle">
              金額
            </AppText>
            <MoneyInput
              accessibilityLabel="追加する科目の金額"
              value={extraAmount}
              onChange={setExtraAmount}
            />
          </View>
          <AppButton label="追加" variant="ghost" size="sm" onPress={addExtra} />
        </View>
        <AmountField
          label="農産物以外の棚卸高（期首）"
          value={agriculture.otherOpeningInventory}
          onChange={(v) => set({ otherOpeningInventory: v })}
        />
        <AmountField
          label="農産物以外の棚卸高（期末）"
          value={agriculture.otherClosingInventory}
          onChange={(v) => set({ otherClosingInventory: v })}
        />
        <AmountField
          label="経費から差し引く育成費用"
          value={agriculture.cultivationCostDeduction}
          onChange={(v) => set({ cultivationCostDeduction: v })}
        />
        <ResultRow label="経費計" value={statement.expensesTotal} />
        <ResultRow label="差引金額" value={statement.balanceAmount} strong />

        {white ? (
          <>
            <SectionHead title="専従者控除" />
            <AmountField
              label="専従者控除"
              value={agriculture.familyWorkerDeduction}
              onChange={(v) => set({ familyWorkerDeduction: v })}
            />
          </>
        ) : (
          <>
            <SectionHead title="引当金・専従者給与" />
            <AmountField
              label="専従者給与"
              value={agriculture.familyWorkerSalary}
              onChange={(v) => set({ familyWorkerSalary: v })}
            />
            <AmountField
              label="貸倒引当金繰入額"
              value={agriculture.badDebtProvisionIn}
              onChange={(v) => set({ badDebtProvisionIn: v })}
            />
            <AmountField
              label="貸倒引当金繰戻額"
              value={agriculture.badDebtProvisionBack}
              onChange={(v) => set({ badDebtProvisionBack: v })}
            />
          </>
        )}
        <AmountField
          label="肉用牛特例金額（表示のみ）"
          value={agriculture.beefCattleExemptionAmount}
          onChange={(v) => set({ beefCattleExemptionAmount: v })}
        />
        <ResultRow
          label={white ? "農業所得の金額" : "青色申告特別控除前の所得金額"}
          value={incomeBeforeBlue}
          strong
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  extraRow: { gap: space.xs },
  extraMain: { gap: 4 },
  addRow: { gap: space.sm },
  addAmount: { gap: 4 },
});
