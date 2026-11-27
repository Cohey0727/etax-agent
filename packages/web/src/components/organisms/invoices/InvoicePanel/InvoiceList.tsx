import { INVOICE_PAYMENT_STATUS_LABELS, INVOICE_STATUS_LABELS } from "@etax/shared";
import { Badge, Card, Col, Row, Text } from "@components/atoms";
import { InvoiceRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./InvoicePanel.css";

export interface InvoiceListProps {
  invoices: InvoiceRecord[];
  onSelect: (invoiceId: number) => void;
}

/** 請求書カードの一覧。発行済みは帳票番号、下書きはその旨を出す。 */
export const InvoiceList = ({ invoices, onSelect }: InvoiceListProps) => {
  return (
    <div className={styles.cardGrid}>
      {invoices.map((invoice) => (
        <Card
          key={invoice.id}
          className={styles.invoiceCard}
          onClick={() => onSelect(invoice.id)}
        >
          <Col gap="sm">
            <Row gap="sm" align="center" wrap>
              <Badge>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
              {invoice.document_number ? <Badge>{invoice.document_number}</Badge> : null}
              {invoice.corrects_document_number ? (
                <Badge>修正（{invoice.corrects_document_number}）</Badge>
              ) : null}
              {invoice.is_qualified ? <Badge>適格請求書</Badge> : null}
              {invoice.payment_status ? (
                <Badge>{INVOICE_PAYMENT_STATUS_LABELS[invoice.payment_status]}</Badge>
              ) : null}
            </Row>
            <Text variant="sectionTitle">{invoice.counterparty_name || "（交付先未入力）"}</Text>
            <Row justify="spaceBetween" align="center">
              <Text variant="caption">発行日 {invoice.issue_date}</Text>
              <Text variant="body">{formatYen(invoice.totals.total)}</Text>
            </Row>
            {invoice.payment_status && invoice.payment_status !== "paid" ? (
              <Text variant="caption">残額 {formatYen(invoice.remaining_amount)}</Text>
            ) : null}
          </Col>
        </Card>
      ))}
    </div>
  );
};
