/**
 * mcpInvoiceTools.ts — MCP の請求書・入金消込まわりのツール（services/mcp）。
 *
 * 請求書の一覧・取得（消込状態つき）、作成・更新・削除（下書きのみ）、
 * 発行、修正用下書きの作成、PDF取得と、入金消込の一覧・候補推測・作成・
 * 解除。REST の /api/invoices/* と同じサービス（services/invoice）・
 * リポジトリを使うため、発行済み帳票の不変などの業務ルールは MCP 経由
 * でも同じに効く。候補推測（suggest_invoice_payments）は提示だけで自動
 * 確定はせず、消込は create_invoice_payment の明示的な呼び出しでのみ
 * 確定する。発行も issue_invoice の明示的な呼び出しでのみ行う。
 */
import {
  fetchInvoiceResponse,
  fetchInvoiceResponses,
  getInvoiceRow,
  InvoiceListFilters,
  listInvoiceRows,
} from "../../repositories/invoiceRepository";
import { fetchPaymentsResponse } from "../../repositories/reconciliationRepository";
import {
  CreateInvoiceRequest,
  CreateInvoiceRequestSchema,
} from "../../schemas/invoice";
import { CreateInvoicePaymentRequestSchema } from "../../schemas/reconciliation";
import {
  createInvoiceCorrectionDraft,
  createInvoiceDocument,
  deleteInvoiceDocument,
  getInvoicePdf,
  issueInvoiceDocument,
  updateInvoiceDocument,
} from "../invoice/invoiceDocuments";
import {
  applyInvoicePayment,
  releaseInvoicePayment,
  suggestInvoicePayments,
} from "../reconciliation/reconcileInvoice";
import { McpToolModule, idArg, requireDb, textResult } from "./mcpToolKit";

const invoiceIdProperty = { type: "integer", description: "請求書ID" };

const invoiceLineProperties = {
  type: "array",
  description:
    "明細行: [{item_name（品目）, quantity（数量）, unit（単位、任意）, unit_price（税抜単価・円）, tax_rate_percent（税率%）, is_reduced_rate（軽減税率対象か、任意）}]。消費税は税率グループごとに1回だけ端数処理する",
  items: { type: "object" },
};

const invoiceBodyProperties = {
  issue_date: { type: "string", description: "発行日（YYYY-MM-DD）" },
  due_date: { type: "string", description: "支払期日（YYYY-MM-DD、任意）" },
  counterparty_name: { type: "string", description: "交付先の名称" },
  counterparty_address: { type: "string", description: "交付先の住所（任意）" },
  is_qualified: {
    type: "boolean",
    description: "適格請求書として発行するか（任意、既定 true）",
  },
  tax_rounding: {
    type: "string",
    enum: ["floor", "round", "ceil"],
    description: "消費税の端数処理（任意、既定 floor=切り捨て）",
  },
  memo: { type: "string", description: "備考（任意）" },
  lines: invoiceLineProperties,
};

/** MCP 引数から請求書の入力（REST の作成・更新リクエストと同じ形）を組み立てる。 */
function invoiceBodyArg(args: Record<string, unknown>): CreateInvoiceRequest {
  const parsed = CreateInvoiceRequestSchema.safeParse({
    issue_date: args["issue_date"],
    due_date: args["due_date"],
    counterparty_name: args["counterparty_name"],
    counterparty_address: args["counterparty_address"],
    is_qualified: args["is_qualified"],
    tax_rounding: args["tax_rounding"],
    memo: args["memo"],
    lines: args["lines"],
  });
  if (!parsed.success) {
    throw new Error(
      "請求書の入力が不正です（issue_date・counterparty_name・lines が必要で、単価は税抜の整数、数量は正の数です）",
    );
  }
  return parsed.data;
}

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
      name: "create_invoice",
      description:
        "請求書の下書きを作成する。単価は税抜、消費税は税率グループごとに1回だけ端数処理される。作成時点では採番されず、発行（issue_invoice）で不変化する。",
      inputSchema: {
        type: "object",
        properties: invoiceBodyProperties,
        required: ["issue_date", "counterparty_name", "lines"],
      },
    },
    {
      name: "update_invoice",
      description:
        "請求書の下書きを更新する（ヘッダ＋明細の全体差し替え）。発行済みの請求書は変更できない（修正は create_invoice_correction で行う）。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty, ...invoiceBodyProperties },
        required: ["invoice_id", "issue_date", "counterparty_name", "lines"],
      },
    },
    {
      name: "delete_invoice",
      description:
        "請求書の下書きを削除する。発行済みの請求書は写しの保存義務（7年）のため削除できない。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty },
        required: ["invoice_id"],
      },
    },
    {
      name: "issue_invoice",
      description:
        "請求書を発行する（明示的な実行ツール）。採番し、発行者情報をスナップショットとして凍結して不変化する。適格請求書の場合は記載事項（交付先・発行日・品目・税率区分・登録番号）を検証し、不足があればエラーになる。登録番号は納税者プロフィールの値をそのまま使い、自動生成・補完はしない。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty },
        required: ["invoice_id"],
      },
    },
    {
      name: "create_invoice_correction",
      description:
        "発行済み請求書の「修正した適格請求書」の下書きを作成する。元帳票は不変のまま、内容をコピーした新しい下書き（修正元への参照つき）ができる。内容を直したら issue_invoice で発行する。",
      inputSchema: {
        type: "object",
        properties: { invoice_id: invoiceIdProperty },
        required: ["invoice_id"],
      },
    },
    {
      name: "get_invoice_pdf",
      description:
        "発行済み請求書の PDF を Base64 で返す（pdf_base64 を保存すれば PDF ファイルとして復元できる）。下書きは PDF 化できない。",
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
      const invoices = await fetchInvoiceResponses(db, rows);
      return textResult({ invoices });
    },
    get_invoice: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const row = await getInvoiceRow(db, invoiceId);
      if (!row) throw new Error(`請求書が見つかりません: id=${invoiceId}`);
      return textResult({ invoice: await fetchInvoiceResponse(db, row) });
    },
    create_invoice: async (args) => {
      const db = requireDb();
      const invoice = await createInvoiceDocument(db, invoiceBodyArg(args));
      return textResult({ invoice });
    },
    update_invoice: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const invoice = await updateInvoiceDocument(db, invoiceId, invoiceBodyArg(args));
      return textResult({ invoice });
    },
    delete_invoice: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      await deleteInvoiceDocument(db, invoiceId);
      return textResult({ deleted: true, invoice_id: invoiceId });
    },
    issue_invoice: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const invoice = await issueInvoiceDocument(db, invoiceId);
      return textResult({ invoice });
    },
    create_invoice_correction: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const invoice = await createInvoiceCorrectionDraft(db, invoiceId);
      return textResult({ invoice });
    },
    get_invoice_pdf: async (args) => {
      const db = requireDb();
      const invoiceId = idArg(args, "invoice_id");
      const { filename, pdf } = await getInvoicePdf(db, invoiceId);
      return textResult({ filename, pdf_base64: Buffer.from(pdf).toString("base64") });
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
