/**
 * mcpInvoiceTools.ts — MCP の請求書・入金消込まわりのツール（services/mcp）。
 *
 * 請求書の一覧・取得（消込状態つき）と、入金消込の一覧・候補推測・作成・
 * 解除。REST の /api/invoices/* と同じリポジトリ/サービスを使う。
 * 候補推測（suggest_invoice_payments）は提示だけで自動確定はせず、
 * 消込は create_invoice_payment の明示的な呼び出しでのみ確定する。
 */
import {
  fetchInvoiceResponse,
  getInvoiceRow,
  InvoiceListFilters,
  listInvoiceRows,
} from "../../repositories/invoiceRepository";
import { fetchPaymentsResponse } from "../../repositories/reconciliationRepository";
import { CreateInvoicePaymentRequestSchema } from "../../schemas/reconciliation";
import {
  applyInvoicePayment,
  releaseInvoicePayment,
  suggestInvoicePayments,
} from "../reconciliation/reconcileInvoice";
import { McpToolModule, idArg, requireDb, textResult } from "./mcpToolKit";

const invoiceIdProperty = { type: "integer", description: "請求書ID" };

export const mcpInvoiceTools: McpToolModule = {
  tools: [
    {
      name: "list_invoices",
      description:
        "請求書の一覧を返す。各請求書には消込状態（payment_status: unpaid/partial/paid）と消込済み額・残額が付く。q は交付先名称・帳票番号の部分一致、status は draft/issued で絞り込む。",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "交付先・帳票番号の部分一致（任意）" },
          status: {
            type: "string",
            enum: ["draft", "issued"],
            description: "状態で絞り込む（任意）",
          },
        },
      },
    },
    {
      name: "get_invoice",
      description: "請求書を1件返す（明細・集計・消込状態つき）。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty },
        required: ["invoice_id"],
      },
    },
    {
      name: "list_invoice_payments",
      description:
        "請求書の入金消込の一覧とサマリ（請求額・消込済み額・残額・過入金額・状態）を返す。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty },
        required: ["invoice_id"],
      },
    },
    {
      name: "suggest_invoice_payments",
      description:
        "請求書への消込候補を自動推測して返す（金額一致・取引先名の近似・期日の近接で採点）。候補の提示だけであり、消込は確定しない。確定するには create_invoice_payment を明示的に呼ぶこと。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty },
        required: ["invoice_id"],
      },
    },
    {
      name: "create_invoice_payment",
      description:
        "発行済み請求書へ入金取引を消し込む（明示的な実行ツール）。amount 省略時は入金の未消込額と請求残額の小さい方を充当する。fee_amount は振込手数料として支払手数料の取引を自動生成して差額調整し、discount_amount は売上値引として差額調整する。treat_excess_as_deposit が true なら、充当しきれない入金の残りを過入金として預り金の取引を自動生成し、入金取引を使い切る。",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: invoiceIdProperty,
          transaction_id: { type: "integer", description: "入金取引のID（プラスの取引）" },
          amount: { type: "integer", description: "充当額（任意）" },
          fee_amount: { type: "integer", description: "振込手数料として調整する額（任意）" },
          discount_amount: { type: "integer", description: "売上値引として調整する額（任意）" },
          treat_excess_as_deposit: {
            type: "boolean",
            description: "過入金の残りを預り金として処理するか（任意）",
          },
        },
        required: ["invoice_id", "transaction_id"],
      },
    },
    {
      name: "delete_invoice_payment",
      description:
        "請求書の消込を解除する。その消込で自動生成した差額調整・預り金の取引も一緒に論理削除される（入金取引そのものは残る）。",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: invoiceIdProperty,
          payment_id: { type: "integer", description: "消込レコードのID" },
        },
        required: ["invoice_id", "payment_id"],
      },
    },
  ],
  handlers: {
    list_invoices: async (args) => {
      const db = requireDb();
      const filters: InvoiceListFilters = {};
      if (typeof args["q"] === "string" && args["q"]) filters.q = args["q"];
      if (args["status"] === "draft" || args["status"] === "issued") {
        filters.status = args["status"];
      }
      const rows = await listInvoiceRows(db, filters);
      const invoices = await Promise.all(rows.map((row) => fetchInvoiceResponse(db, row)));
      return textResult({ invoices });
    },
    get_invoice: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const row = await getInvoiceRow(db, invoiceId);
      if (!row) throw new Error(`請求書が見つかりません: id=${invoiceId}`);
      return textResult({ invoice: await fetchInvoiceResponse(db, row) });
    },
    list_invoice_payments: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const row = await getInvoiceRow(db, invoiceId);
      if (!row) throw new Error(`請求書が見つかりません: id=${invoiceId}`);
      return textResult(await fetchPaymentsResponse(db, row));
    },
    suggest_invoice_payments: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const candidates = await suggestInvoicePayments(db, invoiceId);
      return textResult({ candidates });
    },
    create_invoice_payment: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const parsed = CreateInvoicePaymentRequestSchema.safeParse({
        transaction_id: args["transaction_id"],
        amount: args["amount"],
        fee_amount: args["fee_amount"],
        discount_amount: args["discount_amount"],
        treat_excess_as_deposit: args["treat_excess_as_deposit"],
      });
      if (!parsed.success) {
        throw new Error("transaction_id（正の整数）と金額の指定が不正です");
      }
      return textResult(await applyInvoicePayment(db, { invoiceId, ...parsed.data }));
    },
    delete_invoice_payment: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const paymentId = idArg(args, "payment_id");
      return textResult(await releaseInvoicePayment(db, invoiceId, paymentId));
    },
  },
};
