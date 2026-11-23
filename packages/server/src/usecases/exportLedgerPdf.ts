/**
 * exportLedgerPdf.ts — 帳簿 PDF のダウンロードユースケース（usecases）。DB必須。
 *
 * 指定年の取引を帳簿画面と同じ並びで PDF 化して返す。生成は services/pdf。
 * 日本語フォントがサーバーに配置されていない場合は 503 で配置方法を案内する。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "@hono/zod-openapi";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  effectiveFiscalYear,
  listTransactionRows,
  transactionToApi,
} from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import { LedgerPdfQuerySchema } from "../schemas/transaction";
import { buildLedgerPdf } from "../services/pdf/buildLedgerPdf";
import { loadJapaneseFont } from "../services/pdf/loadJapaneseFont";

export const exportLedgerPdfRoute = createRoute({
  method: "get",
  path: "/api/transactions/pdf",
  operationId: "exportLedgerPdf",
  tags: ["Transactions"],
  summary: "帳簿PDFをダウンロード（DB必須）",
  request: { query: LedgerPdfQuerySchema },
  responses: {
    200: {
      content: { "application/pdf": { schema: z.string() } },
      description: "帳簿PDF",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定・接続不可、または日本語フォント未配置",
    },
  },
});

export const exportLedgerPdfHandler: RouteHandler<typeof exportLedgerPdfRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { year: yearRaw } = c.req.valid("query");
  const year = Number(yearRaw);
  if (!yearRaw || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HTTPException(400, { message: "year には対象年（西暦）を指定してください" });
  }
  let rows;
  try {
    rows = await listTransactionRows(db);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const yearRows = rows.filter((r) => effectiveFiscalYear(r) === year).map(transactionToApi);
  const fontBytes = await loadJapaneseFont();
  if (!fontBytes) {
    throw new HTTPException(503, {
      message:
        "PDF用の日本語フォントがサーバーに配置されていません。データフォルダの fonts/ に日本語フォント（ipaexg.ttf 等）を置いてください。",
    });
  }
  const pdf = await buildLedgerPdf(yearRows, year, new Date(), fontBytes);
  // pdf-lib の返り値は ArrayBufferLike 付きの型なので、素の Uint8Array に詰め替えて渡す。
  const body = new Uint8Array(pdf.byteLength);
  body.set(pdf);
  return c.body(body, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="ledger-${year}.pdf"`,
  });
};
