/**
 * createInvoiceCorrection.ts — 「修正した適格請求書」の下書き作成ユースケース（usecases）。DB必須。
 *
 * 発行済み帳票は不変のため、内容の修正は元帳票をコピーした新しい下書きを
 * 作り、修正元への参照（corrects_document_id）を付けて発行し直す形で行う
 * （消費税法57条の4第4項：修正は発行側が修正した適格請求書を交付する）。
 * 発行日は当日で初期化する（取引年月日は修正書類自身の交付日）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  fetchInvoiceResponse,
  getInvoiceRow,
  insertInvoice,
  InvoiceHeaderDraft,
  InvoiceLineDraft,
  listInvoiceLines,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
} from "../schemas/invoice";

export const createInvoiceCorrectionRoute = createRoute({
  method: "post",
  path: "/api/invoices/{id}/correct",
  operationId: "createInvoiceCorrection",
  tags: ["Invoices"],
  summary: "発行済み請求書の修正用下書きを作成（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "作成された修正用下書き",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "発行済みでないため修正を作れない",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "請求書が存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

/** JST の今日（YYYY-MM-DD）。サーバーのタイムゾーンに依存しない。 */
function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const createInvoiceCorrectionHandler: RouteHandler<
  typeof createInvoiceCorrectionRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  let response: SingleInvoiceResponse;
  try {
    const source = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!source) throw new HTTPException(404, { message: "請求書が見つかりません" });
    if (source.status !== "issued") {
      throw new HTTPException(400, {
        message: "修正用下書きは発行済みの請求書からだけ作れます（下書きはそのまま編集してください）",
      });
    }
    const sourceLines = await listInvoiceLines(db, id);
    const header: InvoiceHeaderDraft = {
      issue_date: todayInTokyo(),
      due_date: source.dueDate,
      counterparty_name: source.counterpartyName,
      counterparty_address: source.counterpartyAddress,
      is_qualified: source.isQualified,
      tax_rounding: source.taxRounding as InvoiceHeaderDraft["tax_rounding"],
      memo: source.memo,
    };
    const lines: InvoiceLineDraft[] = sourceLines.map((line) => ({
      item_name: line.itemName,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unitPrice,
      tax_rate_percent: line.taxRatePercent,
      is_reduced_rate: line.isReducedRate,
    }));
    const row = await insertInvoice(db, header, lines, source.id);
    response = { invoice: row ? await fetchInvoiceResponse(db, row) : null };
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 201);
};
