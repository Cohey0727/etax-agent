import { useMemo, useState } from "react";
import {
  AGRICULTURE_EXPENSE_CATEGORIES,
  AgricultureInput,
  FilingType,
  agricultureIncomeBeforeBlueDeduction,
  computeAgricultureStatement,
} from "@etax/shared";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { LabeledAmountField } from "@components/molecules/LabeledAmountField";
import { formatYen } from "@utils";
import { toAmount } from "@utils/amountInput";
import { removeAgricultureExpense, setAgricultureExpense } from "./AgriculturePanel.utils";
import { ResultRow, TextField } from "./fields";
import styles from "./AgriculturePanel.css";

export interface AgriculturePanelProps {
  agriculture: AgricultureInput;
  /** 申告の種類（青色は専従者給与・貸倒引当金、白色は専従者控除を表示する） */
  filingType: FilingType;
  onChange: (next: AgricultureInput) => void;
}

/**
 * 農業所得の入力（Issue #24 Phase 1）。帳簿の取引とは混ぜず申告入力として
 * 保持し、農業所得用の決算書（青色は青色申告決算書（農業所得用）、白色は
 * 収支内訳書（農業所得用））と申告書の農業欄へ反映する。科目構成と
 * 計算は国税庁の農業所得用様式どおり（shared の決定的計算）。
 * 収入金額の内訳・育成費用の計算・貸借対照表は Phase 1 の対象外。
 */
export const AgriculturePanel = ({ agriculture, filingType, onChange }: AgriculturePanelProps) => {
  const statement = useMemo(() => computeAgricultureStatement(agriculture), [agriculture]);
  const white = filingType === "white";
  const [extraName, setExtraName] = useState("");
  const [extraAmount, setExtraAmount] = useState(0);

  const set = (patch: Partial<AgricultureInput>) => onChange({ ...agriculture, ...patch });
  const setExpense = (category: string, value: number) =>
    set({ expenseTotals: setAgricultureExpense(agriculture.expenseTotals, category, value) });
  const removeExpense = (category: string) =>
    set({ expenseTotals: removeAgricultureExpense(agriculture.expenseTotals, category) });
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
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">農業所得</Text>
          <Text variant="muted">
            農業の収支は帳簿（事業・不動産）とは分けて、ここで入力します。
            {white
              ? "収支内訳書（農業所得用）"
              : "青色申告決算書（農業所得用）"}
            と申告書の事業（農業）欄に出力されます。収入金額の内訳・
            育成費用の計算・貸借対照表は未対応です。
          </Text>
        </Col>

        <TextField
          label="農園名"
          value={agriculture.farmName}
          onChange={(v) => set({ farmName: v })}
        />

        <Text variant="sectionTitle">収入金額</Text>
        <LabeledAmountField
          label="販売金額"
          value={agriculture.salesAmount}
          onChange={(v) => set({ salesAmount: v })}
        />
        <LabeledAmountField
          label="家事消費・事業消費金額"
          value={agriculture.householdConsumption}
          onChange={(v) => set({ householdConsumption: v })}
        />
        <LabeledAmountField
          label="雑収入"
          value={agriculture.miscRevenue}
          onChange={(v) => set({ miscRevenue: v })}
        />
        <LabeledAmountField
          label="農産物の棚卸高（期首）"
          value={agriculture.produceOpeningInventory}
          onChange={(v) => set({ produceOpeningInventory: v })}
        />
        <LabeledAmountField
          label="農産物の棚卸高（期末）"
          value={agriculture.produceClosingInventory}
          onChange={(v) => set({ produceClosingInventory: v })}
        />
        <ResultRow label="収入金額の計" value={formatYen(statement.revenueTotal)} />

        <Text variant="sectionTitle">経費</Text>
        {AGRICULTURE_EXPENSE_CATEGORIES.map((category) => (
          <LabeledAmountField
            key={category}
            label={category === "地代賃借料" && white ? "小作料・賃借料" : category}
            value={agriculture.expenseTotals[category] ?? 0}
            onChange={(v) => setExpense(category, v)}
          />
        ))}
        {extraCategories.map((category) => (
          <Row key={category} gap="sm">
            <div className={styles.fieldLabel}>
              <Text variant="muted">{category}（追加科目）</Text>
            </div>
            <Input
              className={styles.fieldInput}
              type="number"
              value={agriculture.expenseTotals[category] ?? 0}
              onChange={(e) => setExpense(category, toAmount(e.target.value))}
              aria-label={category}
            />
            <Button variant="ghost" size="sm" onClick={() => removeExpense(category)}>
              削除
            </Button>
          </Row>
        ))}
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">科目を追加</Text>
          </div>
          <Input
            className={styles.fieldText}
            type="text"
            value={extraName}
            onChange={(e) => setExtraName(e.target.value)}
            aria-label="追加する科目名"
            placeholder="科目名"
          />
          <Input
            className={styles.fieldInput}
            type="number"
            value={extraAmount}
            onChange={(e) => setExtraAmount(toAmount(e.target.value))}
            aria-label="追加する科目の金額"
          />
          <Button variant="ghost" size="sm" onClick={addExtra}>
            追加
          </Button>
        </Row>
        <LabeledAmountField
          label="農産物以外の棚卸高（期首）"
          value={agriculture.otherOpeningInventory}
          onChange={(v) => set({ otherOpeningInventory: v })}
        />
        <LabeledAmountField
          label="農産物以外の棚卸高（期末）"
          value={agriculture.otherClosingInventory}
          onChange={(v) => set({ otherClosingInventory: v })}
        />
        <LabeledAmountField
          label="経費から差し引く育成費用"
          value={agriculture.cultivationCostDeduction}
          onChange={(v) => set({ cultivationCostDeduction: v })}
        />
        <ResultRow label="経費計" value={formatYen(statement.expensesTotal)} />
        <ResultRow label="差引金額" value={formatYen(statement.balanceAmount)} />

        {white ? (
          <>
            <Text variant="sectionTitle">専従者控除</Text>
            <LabeledAmountField
              label="専従者控除"
              value={agriculture.familyWorkerDeduction}
              onChange={(v) => set({ familyWorkerDeduction: v })}
            />
          </>
        ) : (
          <>
            <Text variant="sectionTitle">引当金・専従者給与</Text>
            <LabeledAmountField
              label="専従者給与"
              value={agriculture.familyWorkerSalary}
              onChange={(v) => set({ familyWorkerSalary: v })}
            />
            <LabeledAmountField
              label="貸倒引当金繰入額"
              value={agriculture.badDebtProvisionIn}
              onChange={(v) => set({ badDebtProvisionIn: v })}
            />
            <LabeledAmountField
              label="貸倒引当金繰戻額"
              value={agriculture.badDebtProvisionBack}
              onChange={(v) => set({ badDebtProvisionBack: v })}
            />
          </>
        )}
        <LabeledAmountField
          label="肉用牛特例金額（表示のみ）"
          value={agriculture.beefCattleExemptionAmount}
          onChange={(v) => set({ beefCattleExemptionAmount: v })}
        />
        <ResultRow
          label={white ? "農業所得の金額" : "青色申告特別控除前の所得金額"}
          value={formatYen(incomeBeforeBlue)}
        />
      </Col>
    </Card>
  );
};
