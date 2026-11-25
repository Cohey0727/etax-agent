import { Badge, Card, Col, Row, Text } from "@components/atoms";
import { InvoiceRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./InvoicePanel.css";
import { STATUS_LABELS } from "./invoiceOptions";

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
              <Badge>{STATUS_LABELS[invoice.status]}</Badge>
              {invoice.document_number ? <Badge>{invoice.document_number}</Badge> : null}
              {invoice.corrects_document_number ? (
                <Badge>修正（{invoice.corrects_document_number}）</Badge>
              ) : null}
              {invoice.is_qualified ? <Badge>適格請求書</Badge> : null}
            </Row>
            <Text variant="sectionTitle">{invoice.counterparty_name || "（交付先未入力）"}</Text>
            <Row justify="spaceBetween" align="center">
              <Text variant="caption">発行日 {invoice.issue_date}</Text>
              <Text variant="body">{formatYen(invoice.totals.total)}</Text>
            </Row>
          </Col>
        </Card>
      ))}
    </div>
  );
};
