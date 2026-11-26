import { useState } from "react";
import { View } from "react-native";
import { classifyAccount, LedgerTransactionInput } from "@/api";
import { AlertBox, AppButton, AppText, DateField, Field, SelectField } from "@/components";
import { parseAmount } from "@/utils";
import {
  BUSINESS_RATIO_GUIDE_CATEGORIES,
  BUSINESS_RATIO_GUIDE_TEXT,
  CATEGORY_OPTIONS,
  INCOME_TYPE_OPTIONS,
  TAX_CATEGORY_OPTIONS,
} from "../options";

export interface LedgerFormProps {
  value: LedgerTransactionInput;
  yearOptions: readonly number[];
  onChange: (next: LedgerTransactionInput) => void;
  /** 科目判定ボタンを出す（追加・編集共通）。 */
  showClassify?: boolean;
}

/** 取引の入力フォーム（追加と編集で共用）。値は親が持つ。 */
export function LedgerForm({ value, yearOptions, onChange, showClassify = true }: LedgerFormProps) {
  const [classifying, setClassifying] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  const set = (patch: Partial<LedgerTransactionInput>) => onChange({ ...value, ...patch });

  const handleClassify = async () => {
    if (!value.description.trim() || classifying) return;
    setClassifying(true);
    setClassifyError(null);
    try {
      const result = await classifyAccount(value.description);
      if (result.account && result.account !== "未分類") {
        setSuggestion(result.account);
        set({ category: result.account });
      } else {
        setSuggestion(null);
        setClassifyError("科目を判定できませんでした");
      }
    } catch (e) {
      setClassifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setClassifying(false);
    }
  };

  const years = [...new Set([...yearOptions, value.fiscal_year, Number(value.date.slice(0, 4))])]
    .filter((y) => Number.isInteger(y) && y > 0)
    .sort((a, b) => b - a);

  return (
    <View style={{ gap: 12 }}>
      <DateField label="日付" value={value.date} onChange={(date) => set({ date })} />
      <SelectField
        label="年度（割り当て）"
        value={String(value.fiscal_year)}
        options={years.map((y) => ({ value: String(y), label: `${y}年` }))}
        onChange={(v) => set({ fiscal_year: Number(v) })}
      />
      <Field
        label="摘要"
        value={value.description}
        onChangeText={(description) => set({ description })}
        placeholder="例: サーバー利用料"
      />
      {showClassify ? (
        <View style={{ gap: 6 }}>
          <AppButton
            label={classifying ? "判定中…" : "摘要から勘定科目を判定"}
            variant="ghost"
            size="sm"
            loading={classifying}
            onPress={() => void handleClassify()}
          />
          {suggestion ? <AppText size="sm" tone="accent">提案: {suggestion}（勘定科目に反映しました）</AppText> : null}
          {classifyError ? <AlertBox tone="warn" message={classifyError} /> : null}
        </View>
      ) : null}
      <Field
        label="金額（支出はマイナス）"
        value={value.amount === 0 ? "" : String(value.amount)}
        onChangeText={(t) => set({ amount: parseAmount(t) })}
        keyboardType="numbers-and-punctuation"
        inputMode="decimal"
        placeholder="0"
      />
      <SelectField
        label="勘定科目"
        value={value.category}
        options={CATEGORY_OPTIONS.map((name) => ({ value: name, label: name }))}
        onChange={(category) => set({ category })}
      />
      <SelectField
        label="区分"
        value={value.income_type}
        options={INCOME_TYPE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }))}
        onChange={(income_type) => set({ income_type })}
      />
      <SelectField
        label="税区分"
        value={value.tax_category}
        options={TAX_CATEGORY_OPTIONS}
        onChange={(tax_category) => set({ tax_category })}
      />
      <Field label="出所" value={value.account} onChangeText={(account) => set({ account })} />
      <Field
        label="事業割合（%）"
        value={String(value.business_ratio_percent)}
        onChangeText={(t) => set({ business_ratio_percent: Math.min(100, Math.max(0, parseAmount(t))) })}
        keyboardType="number-pad"
        inputMode="numeric"
      />
      {BUSINESS_RATIO_GUIDE_CATEGORIES.has(value.category) && value.business_ratio_percent >= 100 ? (
        <AppText size="xs" tone="muted">{BUSINESS_RATIO_GUIDE_TEXT}</AppText>
      ) : null}
      <Field
        label="按分根拠（任意）"
        value={value.business_ratio_basis}
        onChangeText={(business_ratio_basis) => set({ business_ratio_basis })}
        placeholder="例: 面積割合"
      />
    </View>
  );
}
