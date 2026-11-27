import {
  formatInvoiceQuantity,
  INVOICE_PAYMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_TAX_ROUNDING_LABELS,
} from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { InvoiceRecord } from "@/api";
import { AppButton, AppText, Chip, LabeledValue } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatDate, formatYen } from "@/utils";
import { PAYMENT_STATUS_TONES } from "../invoiceOptions";
import { InvoiceReconciliation } from "../InvoiceReconciliation";

export interface InvoiceDetailProps {
  invoice: InvoiceRecord;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onIssue: () => void;
  onCorrect: () => void;
  onSharePdf: () => void;
  /** 消込・解除の後に一覧側の消込状態を更新するための通知。 */
  onReconciliationChanged?: () => void;
}

/**
 * 請求書の詳細。発行済みは不変のため、導線は PDF の共有と
 * 「修正した適格請求書」の新規作成だけにし、編集・削除は出さない。
 */
export function InvoiceDetail({
  invoice,
  busy,
  onEdit,
  onDelete,
  onIssue,
  onCorrect,
  onSharePdf,
  onReconciliationChanged,
}: InvoiceDetailProps) {
  const isIssued = invoice.status === "issued";
  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        <Chip label={INVOICE_STATUS_LABELS[invoice.status]} tone={isIssued ? "accent" : "muted"} />
        {invoice.document_number ? <Chip label={invoice.document_number} /> : null}
        {invoice.is_qualified ? <Chip label="適格請求書" /> : null}
        {invoice.corrects_document_number ? (
          <Chip label={`請求書番号 ${invoice.corrects_document_number} の修正`} tone="warn" />
        ) : null}
        {invoice.payment_status ? (
          <Chip
            label={INVOICE_PAYMENT_STATUS_LABELS[invoice.payment_status]}
            tone={PAYMENT_STATUS_TONES[invoice.payment_status]}
          />
        ) : null}
      </View>

      <View>
        <LabeledValue label="交付先" value={invoice.counterparty_name} />
        {invoice.counterparty_address ? (
          <AppText size="sm" tone="muted">
            {invoice.counterparty_address}
          </AppText>
        ) : null}
        <LabeledValue label="発行日" value={formatDate(invoice.issue_date)} />
        {invoice.due_date ? (
          <LabeledValue label="支払期限" value={formatDate(invoice.due_date)} />
        ) : null}
        <LabeledValue label="消費税額の端数処理" value={INVOICE_TAX_ROUNDING_LABELS[invoice.tax_rounding]} />
        {invoice.issuer ? (
          <LabeledValue
            label="発行者"
            value={`${invoice.issuer.name}${invoice.issuer.invoice_number ? `（登録番号 ${invoice.issuer.invoice_number}）` : ""}`}
          />
        ) : null}
      </View>

      <View style={styles.lines}>
        {invoice.lines.map((line) => (
          <View key={line.id} style={styles.lineRow}>
            <AppText weight="semibold">
              {line.item_name}
              {line.is_reduced_rate ? " ※" : ""}
            </AppText>
            <LabeledValue
              label={`数量 ${formatInvoiceQuantity(line.quantity)}${line.unit} ・ 税率 ${line.tax_rate_percent}%`}
              value={formatYen(line.amount)}
            />
            <AppText size="xs" tone="muted">
              単価（税抜）{formatYen(line.unit_price)}
            </AppText>
          </View>
        ))}
      </View>
      {invoice.lines.some((line) => line.is_reduced_rate) ? (
        <AppText size="xs" tone="muted">
          ※は軽減税率対象品目です
        </AppText>
      ) : null}

      <View>
        {invoice.totals.groups.map((group) => (
          <LabeledValue
            key={group.tax_rate_percent}
            label={`${group.tax_rate_percent}%対象（税抜）${formatYen(group.subtotal)}`}
            value={`消費税 ${formatYen(group.tax)}`}
          />
        ))}
        <LabeledValue label="合計（税込）" value={formatYen(invoice.totals.total)} strong />
      </View>

      {invoice.memo ? (
        <View style={styles.section}>
          <AppText size="lg" weight="bold">
            備考
          </AppText>
          <AppText>{invoice.memo}</AppText>
        </View>
      ) : null}

      {isIssued ? (
        <InvoiceReconciliation invoice={invoice} onChanged={onReconciliationChanged ?? (() => {})} />
      ) : null}

      <View style={styles.actions}>
        {isIssued ? (
          <>
            <AppButton label="PDFを共有" disabled={busy} onPress={onSharePdf} />
            <AppButton
              label="修正した適格請求書を作成"
              variant="ghost"
              disabled={busy}
              onPress={onCorrect}
            />
          </>
        ) : (
          <>
            <AppButton label="削除" variant="danger" disabled={busy} onPress={onDelete} />
            <AppButton label="編集" variant="ghost" disabled={busy} onPress={onEdit} />
            <AppButton label="発行する" disabled={busy} loading={busy} onPress={onIssue} />
          </>
        )}
      </View>
      {isIssued ? (
        <AppText size="xs" tone="muted">
          発行済みの請求書は変更・削除できません。内容に誤りがある場合は、修正した適格請求書を新規に発行してください。写しは7年間の保存が必要です。
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  lines: { gap: space.sm },
  lineRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
    padding: space.sm,
  },
  section: { gap: space.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "flex-end" },
});
