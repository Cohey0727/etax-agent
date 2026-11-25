/**
 * invoiceDraft.ts — API リクエストを帳票の下書き（ヘッダ＋明細）へ変換する（services/invoice）。
 */
import { InvoiceHeaderDraft, InvoiceLineDraft } from "../../repositories/invoiceRepository";
import { CreateInvoiceRequest } from "../../schemas/invoice";

export function toInvoiceDrafts(body: CreateInvoiceRequest): {
  header: InvoiceHeaderDraft;
  lines: InvoiceLineDraft[];
} {
  return {
    header: {
      issue_date: body.issue_date,
      due_date: body.due_date ?? null,
      counterparty_name: body.counterparty_name,
      counterparty_address: body.counterparty_address ?? "",
      is_qualified: body.is_qualified ?? true,
      tax_rounding: body.tax_rounding ?? "floor",
      memo: body.memo ?? "",
    },
    lines: body.lines.map((line) => ({
      item_name: line.item_name,
      quantity: line.quantity,
      unit: line.unit ?? "",
      unit_price: line.unit_price,
      tax_rate_percent: line.tax_rate_percent,
      is_reduced_rate: line.is_reduced_rate ?? false,
    })),
  };
}
