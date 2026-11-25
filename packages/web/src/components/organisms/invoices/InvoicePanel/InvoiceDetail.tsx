import { Badge, Button, Col, Row, Table, TableCell, TableHeaderCell, Text } from "@components/atoms";
import { InvoiceRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./InvoicePanel.css";
import { ROUNDING_LABELS, STATUS_LABELS, formatQuantity } from "./invoiceOptions";

export interface InvoiceDetailProps {
  invoice: InvoiceRecord;
  busy: boolean;
  deleteArmed: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onIssue: () => void;
  onCorrect: () => void;
  onDownloadPdf: () => void;
}

/**
 * 請求書の詳細。発行済みは不変のため、導線は PDF ダウンロードと
 * 「修正した適格請求書」の新規作成だけにし、編集・削除は出さない。
 */
export const InvoiceDetail = ({
  invoice,
  busy,
  deleteArmed,
  onEdit,
  onDelete,
  onIssue,
  onCorrect,
  onDownloadPdf,
}: InvoiceDetailProps) => {
  const isIssued = invoice.status === "issued";
  return (
    <Col gap="md">
      <Row gap="sm" align="center" wrap>
        <Badge>{STATUS_LABELS[invoice.status]}</Badge>
        {invoice.document_number ? <Badge>{invoice.document_number}</Badge> : null}
        {invoice.is_qualified ? <Badge>適格請求書</Badge> : null}
        {invoice.corrects_document_number ? (
          <Badge>請求書番号 {invoice.corrects_document_number} の修正</Badge>
        ) : null}
      </Row>

      <Col gap="sm">
        <Text variant="body">交付先: {invoice.counterparty_name}</Text>
        {invoice.counterparty_address ? (
          <Text variant="caption">{invoice.counterparty_address}</Text>
        ) : null}
        <Text variant="caption">発行日: {invoice.issue_date}</Text>
        {invoice.due_date ? <Text variant="caption">支払期限: {invoice.due_date}</Text> : null}
        <Text variant="caption">
          消費税額の端数処理: {ROUNDING_LABELS[invoice.tax_rounding]}
        </Text>
        {invoice.issuer ? (
          <Text variant="caption">
            発行者: {invoice.issuer.name}
            {invoice.issuer.invoice_number ? `（登録番号 ${invoice.issuer.invoice_number}）` : ""}
          </Text>
        ) : null}
      </Col>

      <div className={styles.tableWrap}>
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>品目</TableHeaderCell>
              <TableHeaderCell>数量</TableHeaderCell>
              <TableHeaderCell>単価（税抜）</TableHeaderCell>
              <TableHeaderCell>税率</TableHeaderCell>
              <TableHeaderCell>金額（税抜）</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <TableCell>
                  {line.item_name}
                  {line.is_reduced_rate ? " ※" : ""}
                </TableCell>
                <TableCell>
                  {formatQuantity(line.quantity)}
                  {line.unit}
                </TableCell>
                <TableCell>{formatYen(line.unit_price)}</TableCell>
                <TableCell>{line.tax_rate_percent}%</TableCell>
                <TableCell>{formatYen(line.amount)}</TableCell>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {invoice.lines.some((line) => line.is_reduced_rate) ? (
        <Text variant="caption">※は軽減税率対象品目です</Text>
      ) : null}

      <Col gap="sm">
        {invoice.totals.groups.map((group) => (
          <Row key={group.tax_rate_percent} justify="spaceBetween">
            <Text variant="caption">
              {group.tax_rate_percent}%対象（税抜）{formatYen(group.subtotal)}
            </Text>
            <Text variant="caption">消費税 {formatYen(group.tax)}</Text>
          </Row>
        ))}
        <Row justify="spaceBetween">
          <Text variant="body">合計（税込）</Text>
          <Text variant="body">{formatYen(invoice.totals.total)}</Text>
        </Row>
      </Col>

      {invoice.memo ? (
        <Col gap="sm">
          <Text variant="sectionTitle">備考</Text>
          <Text variant="body">{invoice.memo}</Text>
        </Col>
      ) : null}

      <Row gap="sm" justify="end" wrap>
        {isIssued ? (
          <>
            <Button onClick={onDownloadPdf} disabled={busy}>
              PDFをダウンロード
            </Button>
            <Button variant="tab" onClick={onCorrect} disabled={busy}>
              修正した適格請求書を作成
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={onDelete}
              disabled={busy}
            >
              {deleteArmed ? "本当に削除する" : "削除"}
            </Button>
            <Button variant="tab" onClick={onEdit} disabled={busy}>
              編集
            </Button>
            <Button onClick={onIssue} disabled={busy} disabledReason="処理中です">
              発行する
            </Button>
          </>
        )}
      </Row>
      {isIssued ? (
        <Text variant="caption">
          発行済みの請求書は変更・削除できません。内容に誤りがある場合は、修正した適格請求書を新規に発行してください。写しは7年間の保存が必要です。
        </Text>
      ) : null}
    </Col>
  );
};
