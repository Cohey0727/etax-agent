import { INVOICE_PAYMENT_STATUS_LABELS, INVOICE_STATUS_LABELS } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { InvoiceRecord } from "@/api";
import { AppText, BouncePressable, Card, Chip, LabeledValue } from "@/components";
import { space } from "@/theme";
import { formatDate, formatYen } from "@/utils";
import { PAYMENT_STATUS_TONES } from "../invoiceOptions";

export interface InvoiceListProps {
  invoices: InvoiceRecord[];
  onSelect: (invoiceId: number) => void;
}

/** 請求書カードの一覧。発行済みは帳票番号、下書きはその旨を出す。 */
export function InvoiceList({ invoices, onSelect }: InvoiceListProps) {
  return (
    <View style={styles.list}>
      {invoices.map((invoice, index) => (
        <BouncePressable
          key={invoice.id}
          accessibilityRole="button"
          accessibilityLabel={invoice.counterparty_name || "請求書"}
          onPress={() => onSelect(invoice.id)}
        >
          <Card index={index}>
            <View style={styles.chips}>
              <Chip
                label={INVOICE_STATUS_LABELS[invoice.status]}
                tone={invoice.status === "issued" ? "accent" : "muted"}
              />
              {invoice.document_number ? <Chip label={invoice.document_number} /> : null}
              {invoice.corrects_document_number ? (
                <Chip label={`修正（${invoice.corrects_document_number}）`} tone="warn" />
              ) : null}
              {invoice.is_qualified ? <Chip label="適格請求書" /> : null}
              {invoice.payment_status ? (
                <Chip
                  label={INVOICE_PAYMENT_STATUS_LABELS[invoice.payment_status]}
                  tone={PAYMENT_STATUS_TONES[invoice.payment_status]}
                />
              ) : null}
            </View>
            <AppText size="lg" weight="bold">
              {invoice.counterparty_name || "（交付先未入力）"}
            </AppText>
            <LabeledValue label={`発行日 ${formatDate(invoice.issue_date)}`} value={formatYen(invoice.totals.total)} strong />
            {invoice.payment_status && invoice.payment_status !== "paid" ? (
              <AppText size="xs" tone="muted">
                残額 {formatYen(invoice.remaining_amount)}
              </AppText>
            ) : null}
          </Card>
        </BouncePressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
