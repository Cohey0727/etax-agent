/**
 * issueInvoice.ts — 請求書の発行ユースケース（usecases）。DB必須。
 *
 * 発行 = 採番＋発行者情報のスナップショット凍結＋不変化。
 * 適格請求書として発行する場合は、消費税法57条の4第1項の記載事項が
 * 欠けていないことを発行前に検証する（登録番号はプロフィールの値を
 * そのまま使い、自動生成・補完はしない）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  fetchInvoiceResponse,
  getInvoiceRow,
  listInvoiceLines,
  markInvoiceIssued,
  nextDocumentNumber,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
} from "../schemas/invoice";
import { resolveIssuerProfile } from "../services/invoice/resolveIssuerProfile";
import {
  buildIssuerSnapshot,
  validateInvoiceIssue,
} from "../services/invoice/validateInvoiceIssue";

export const issueInvoiceRoute = createRoute({
  method: "post",
  path: "/api/invoices/{id}/issue",
  operationId: "issueInvoice",
  tags: ["Invoices"],
  summary: "請求書を発行（採番・不変化）（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "発行された請求書",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "記載事項の不足、または発行済み",
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

export const issueInvoiceHandler: RouteHandler<typeof issueInvoiceRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  let response: SingleInvoiceResponse;
  try {
    const row = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!row) throw new HTTPException(404, { message: "請求書が見つかりません" });
    if (row.status === "issued") {
      throw new HTTPException(400, { message: "すでに発行済みです" });
    }
    const lines = await listInvoiceLines(db, id);
    const year = Number(row.issueDate.slice(0, 4));
    const profile = await resolveIssuerProfile(db, Number.isInteger(year) ? year : new Date().getFullYear());
    const problems = validateInvoiceIssue(
      {
        is_qualified: row.isQualified,
        counterparty_name: row.counterpartyName,
        issue_date: row.issueDate,
        lines: lines.map((line) => ({
          item_name: line.itemName,
          tax_rate_percent: line.taxRatePercent,
          is_reduced_rate: line.isReducedRate,
        })),
      },
      profile,
    );
    if (problems.length > 0) {
      throw new HTTPException(400, { message: problems.join("／") });
    }
    const documentNumber = await nextDocumentNumber(db, row.issueDate);
    const issuer = buildIssuerSnapshot(profile, row.isQualified);
    const issued = await markInvoiceIssued(db, id, documentNumber, issuer);
    if (!issued) throw new HTTPException(400, { message: "すでに発行済みです" });
    response = { invoice: await fetchInvoiceResponse(db, issued) };
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
