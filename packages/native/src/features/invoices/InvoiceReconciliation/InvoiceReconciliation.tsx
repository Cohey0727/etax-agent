import {
  INVOICE_PAYMENT_KIND_LABELS,
  INVOICE_PAYMENT_STATUS_LABELS,
  RECONCILIATION_REASON_LABELS,
} from "@etax/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { InvoiceRecord } from "@/api";
import {
  AlertBox,
  AppButton,
  AppText,
  Chip,
  LabeledValue,
  MoneyField,
  SelectField,
  SkeletonBar,
  SwitchRow,
} from "@/components";
import { colors, radius, space } from "@/theme";
import { formatDate, formatYen, parseAmount } from "@/utils";
import { PAYMENT_STATUS_TONES } from "../invoiceOptions";
import { useReconciliationData } from "../useReconciliationData";

export interface InvoiceReconciliationProps {
  invoice: InvoiceRecord;
  /** 消込・解除の後に親の一覧（消込状態）を更新するための通知。 */
  onChanged: () => void;
}

/** 金額入力欄の文字列を整数に読む。空欄は undefined（サーバーの既定値を使う）。 */
const parseOptionalAmount = (text: string): number | undefined => {
  if (text.trim() === "") return undefined;
  return parseAmount(text);
};

/**
 * 発行済み請求書の入金消込セクション。
 * 自動推測の候補は提示だけで、承認ボタンか手動フォームの送信で初めて
 * 消込が確定する。差額は振込手数料・売上値引として調整でき、
 * 過入金は預り金として処理できる。
 */
export function InvoiceReconciliation({ invoice, onChanged }: InvoiceReconciliationProps) {
  const {
    result,
    candidates,
    incomeTransactions,
    loading,
    busy,
    error,
    applyPayment,
    releasePayment,
  } = useReconciliationData(invoice, onChanged);
  const [selectedTxId, setSelectedTxId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [feeText, setFeeText] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [excessAsDeposit, setExcessAsDeposit] = useState(false);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <AppText size="lg" weight="bold">
          入金消込
        </AppText>
        <SkeletonBar width="100%" height={72} />
      </View>
    );
  }
  if (!result) {
    return <AlertBox tone="warn" message="消込情報を取得できませんでした。" />;
  }
  const { settlement } = result;
  const remaining = settlement.remaining_amount;

  const submitManual = () => {
    const transactionId = Number(selectedTxId);
    if (!Number.isInteger(transactionId) || transactionId <= 0) return;
    void (async () => {
      const ok = await applyPayment({
        transaction_id: transactionId,
        amount: parseOptionalAmount(amountText),
        fee_amount: parseOptionalAmount(feeText),
        discount_amount: parseOptionalAmount(discountText),
        treat_excess_as_deposit: excessAsDeposit || undefined,
      });
      if (ok) {
        setSelectedTxId("");
        setAmountText("");
        setFeeText("");
        setDiscountText("");
        setExcessAsDeposit(false);
      }
    })();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <AppText size="lg" weight="bold">
          入金消込
        </AppText>
        <Chip
          label={INVOICE_PAYMENT_STATUS_LABELS[settlement.status]}
          tone={PAYMENT_STATUS_TONES[settlement.status]}
        />
      </View>
      {error ? <AlertBox tone="error" message={error} /> : null}

      <View>
        <LabeledValue label="請求額" value={formatYen(settlement.total_amount)} />
        <LabeledValue label="消込済み" value={formatYen(settlement.settled_amount)} />
        <LabeledValue label="残額" value={formatYen(settlement.remaining_amount)} strong />
        {settlement.overpaid_amount > 0 ? (
          <LabeledValue label="預り金（過入金）" value={formatYen(settlement.overpaid_amount)} />
        ) : null}
      </View>

      {result.payments.length > 0 ? (
        <View style={styles.list}>
          {result.payments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <View style={styles.paymentTexts}>
                <AppText size="sm" weight="semibold">
                  {INVOICE_PAYMENT_KIND_LABELS[payment.kind]} {formatYen(payment.amount)}
                </AppText>
                <AppText size="xs" tone="muted">
                  {payment.transaction
                    ? `${formatDate(payment.transaction.date)} ${payment.transaction.description}`
                    : "（取引は削除済み）"}
                </AppText>
              </View>
              {payment.kind === "payment" ? (
                <AppButton
                  label="解除"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onPress={() => void releasePayment(payment.id)}
                />
              ) : null}
            </View>
          ))}
          <AppText size="xs" tone="muted">
            解除は「入金充当」の行から行います。その消込で自動生成した振込手数料・売上値引・預り金の取引も一緒に取り消されます。
          </AppText>
        </View>
      ) : (
        <AppText size="sm" tone="muted">
          まだ消込はありません。
        </AppText>
      )}

      {remaining > 0 && candidates.length > 0 ? (
        <View style={styles.list}>
          <AppText size="md" weight="bold">
            消込の候補（自動推測）
          </AppText>
          {candidates.map((candidate) => (
            <View key={candidate.transaction.id} style={styles.candidateRow}>
              <AppText size="sm">
                {formatDate(candidate.transaction.date)} {candidate.transaction.description}{" "}
                {formatYen(candidate.transaction.amount)}
              </AppText>
              <View style={styles.chips}>
                {candidate.reasons.map((reason) => (
                  <Chip key={reason} label={RECONCILIATION_REASON_LABELS[reason]} tone="accent" />
                ))}
              </View>
              <AppButton
                label={`${formatYen(candidate.suggested_amount)}で消し込む`}
                size="sm"
                disabled={busy}
                onPress={() =>
                  void applyPayment({
                    transaction_id: candidate.transaction.id,
                    amount: candidate.suggested_amount,
                  })
                }
              />
            </View>
          ))}
          <AppText size="xs" tone="muted">
            候補は金額・取引先名・期日から推測したものです。承認するまで消込は確定しません。
          </AppText>
        </View>
      ) : null}

      {remaining > 0 ? (
        <View style={styles.list}>
          <AppText size="md" weight="bold">
            入金取引を選んで消し込む
          </AppText>
          <SelectField
            label="入金取引"
            onChange={setSelectedTxId}
            options={[
              { value: "", label: "選択してください" },
              ...incomeTransactions.map((tx) => ({
                value: String(tx.id),
                label: `${formatDate(tx.date)} ${tx.description} ${formatYen(tx.amount)}`,
              })),
            ]}
            value={selectedTxId}
          />
          <MoneyField
            label="充当額（空欄なら残額まで）"
            onChangeValue={setAmountText}
            value={amountText}
          />
          <MoneyField label="振込手数料として調整" onChangeValue={setFeeText} value={feeText} />
          <MoneyField
            label="売上値引として調整"
            onChangeValue={setDiscountText}
            value={discountText}
          />
          <SwitchRow
            label="充当しきれない入金の残りは過入金として預り金にする"
            onChange={setExcessAsDeposit}
            value={excessAsDeposit}
          />
          <View style={styles.actions}>
            <AppButton
              label="消し込む"
              disabled={busy || selectedTxId === ""}
              loading={busy}
              onPress={submitManual}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "space-between",
  },
  list: { gap: space.sm },
  paymentRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.sm,
    padding: space.sm,
  },
  paymentTexts: { flex: 1, gap: 2 },
  candidateRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.sm,
    padding: space.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  actions: { flexDirection: "row", justifyContent: "flex-end" },
});
