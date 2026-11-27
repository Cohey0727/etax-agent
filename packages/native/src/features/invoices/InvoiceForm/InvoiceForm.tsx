import {
  emptyInvoiceLine,
  INVOICE_TAX_ROUNDING_OPTIONS,
  invoiceInputTotals,
  invoiceLineAmount,
} from "@etax/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { InvoiceInput, InvoiceLineInput } from "@/api";
import { AppButton, AppText, DateField, Field, LabeledValue, MoneyField, SelectField, SwitchRow } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatYen, parseAmount } from "@/utils";
import { TAX_RATE_OPTIONS } from "../invoiceOptions";

export interface InvoiceFormProps {
  submitLabel: string;
  value: InvoiceInput;
  busy: boolean;
  onChange: (input: InvoiceInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * 請求書の作成・編集フォーム（制御コンポーネント。状態は親が持つ）。
 * 単価は税抜。消費税額は税率ごとに1回だけ端数処理する（プレビューも
 * サーバーと同じ共有計算で出す）。
 */
export function InvoiceForm({ submitLabel, value, busy, onChange, onSubmit, onCancel }: InvoiceFormProps) {
  // 明細ごとの入力中の数量の文字列。「1.」のような途中の入力は数値にすると小数点が
  // 消えるので文字列でも持ち、その文字列が今の数量を表している間だけ表示に使う。
  const [quantityTexts, setQuantityTexts] = useState<Record<number, string>>({});
  const shownQuantity = (index: number, quantity: number): string => {
    const text = quantityTexts[index];
    if (text !== undefined && parseQuantity(text) === quantity) return text;
    return quantity === 0 ? "" : String(quantity);
  };
  const patch = (next: Partial<InvoiceInput>) => onChange({ ...value, ...next });
  const patchLine = (index: number, next: Partial<InvoiceLineInput>) => {
    const lines = value.lines.map((line, i) => {
      if (i !== index) return line;
      const merged = { ...line, ...next };
      // 税率8%以外では軽減フラグは意味を持たないので落とす。
      if (merged.tax_rate_percent !== 8) merged.is_reduced_rate = false;
      return merged;
    });
    patch({ lines });
  };
  const totals = invoiceInputTotals(value);

  return (
    <View style={styles.form}>
      <DateField
        label="発行日"
        onChange={(date) => patch({ issue_date: date })}
        value={value.issue_date}
      />
      <DateField
        label="支払期限（任意）"
        clearable
        onChange={(date) => patch({ due_date: date ? date : null })}
        value={value.due_date ?? ""}
      />
      <Field
        label="交付先の氏名又は名称"
        onChangeText={(text) => patch({ counterparty_name: text })}
        placeholder="例: 株式会社サンプル"
        value={value.counterparty_name}
      />
      <Field
        label="交付先の住所（任意）"
        onChangeText={(text) => patch({ counterparty_address: text })}
        placeholder="例: 東京都港区芝公園4-2-8"
        value={value.counterparty_address}
      />
      <SelectField
        label="消費税額の端数処理"
        onChange={(next) => patch({ tax_rounding: next })}
        options={INVOICE_TAX_ROUNDING_OPTIONS}
        value={value.tax_rounding}
      />
      <SwitchRow
        label="適格請求書として発行"
        description="登録番号を表示する"
        onChange={(checked) => patch({ is_qualified: checked })}
        value={value.is_qualified}
      />

      <AppText size="lg" weight="bold">
        明細
      </AppText>
      {value.lines.map((line, index) => (
        <View key={index} style={styles.lineCard}>
          <Field
            label="品目"
            onChangeText={(text) => patchLine(index, { item_name: text })}
            placeholder="例: 開発支援業務"
            value={line.item_name}
          />
          <Field
            label="数量"
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={(text) => {
              setQuantityTexts((prev) => ({ ...prev, [index]: text }));
              patchLine(index, { quantity: parseQuantity(text) });
            }}
            value={shownQuantity(index, line.quantity)}
          />
          <Field
            label="単位"
            onChangeText={(text) => patchLine(index, { unit: text })}
            placeholder="時間"
            value={line.unit}
          />
          <MoneyField
            label="単価（税抜）"
            onChangeValue={(text) => patchLine(index, { unit_price: parseAmount(text) })}
            value={line.unit_price === 0 ? "" : String(line.unit_price)}
          />
          <SelectField
            label="税率"
            onChange={(next) => patchLine(index, { tax_rate_percent: Number(next) })}
            options={TAX_RATE_OPTIONS}
            value={String(line.tax_rate_percent)}
          />
          <SwitchRow
            label="軽減税率の対象"
            description={line.tax_rate_percent !== 8 ? "税率8%のときだけ指定できます" : undefined}
            onChange={(checked) => patchLine(index, { is_reduced_rate: checked })}
            value={line.is_reduced_rate}
          />
          <LabeledValue
            label="金額（税抜）"
            value={formatYen(
              invoiceLineAmount({
                itemName: line.item_name,
                quantity: line.quantity,
                unit: line.unit,
                unitPrice: line.unit_price,
                taxRatePercent: line.tax_rate_percent,
                isReducedRate: line.is_reduced_rate,
              }),
            )}
            strong
          />
          <AppButton
            label="この明細を削除"
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => patch({ lines: value.lines.filter((_, i) => i !== index) })}
          />
        </View>
      ))}
      <AppButton
        label="明細を追加"
        variant="ghost"
        size="sm"
        disabled={busy}
        onPress={() => patch({ lines: [...value.lines, emptyInvoiceLine()] })}
      />

      <Field
        label="備考（振込先など）"
        multiline
        onChangeText={(text) => patch({ memo: text })}
        value={value.memo}
      />

      <View>
        {totals.groups.map((group) => (
          <LabeledValue
            key={group.taxRatePercent}
            label={`${group.taxRatePercent}%対象（税抜）${formatYen(group.subtotal)}`}
            value={`消費税 ${formatYen(group.tax)}`}
          />
        ))}
        <LabeledValue label="合計（税込）" value={formatYen(totals.total)} strong />
      </View>

      <View style={styles.actions}>
        <AppButton label="キャンセル" variant="ghost" disabled={busy} onPress={onCancel} />
        <AppButton label={submitLabel} disabled={busy} loading={busy} onPress={onSubmit} />
      </View>
    </View>
  );
}

/** 数量の入力を数値にする。空欄・数として読めない入力は 0。 */
function parseQuantity(text: string): number {
  const parsed = Number(text);
  return text === "" || Number.isNaN(parsed) ? 0 : parsed;
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  lineCard: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.sm,
    padding: space.sm,
  },
  actions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
});
