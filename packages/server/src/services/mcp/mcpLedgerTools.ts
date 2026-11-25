/**
 * mcpLedgerTools.ts — MCP の帳簿まわりの追加ツール（services/mcp）。
 *
 * 取引の単件取得・変更履歴・証憑との対応・年度一括置換と、科目の一括
 * 判定、証憑の紐付け解除・実体の取得。REST の /api/transactions/*、
 * /api/classify/batch、/api/receipts/* と同じリポジトリ/サービスを使う。
 */
import { createStorageClient, receiptObjectKey } from "../../gateways/storageGateway";
import { loadStorageConfig } from "../../lib/config";
import { getJevPromptOverride, getRegexRulesOverride, loadSystemOneConfig } from "../../lib/config";
import { createSystemOneClient } from "../../gateways/systemOneGateway";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import {
  getReceiptRowByFileId,
  listReceiptRowsForTransaction,
  receiptToApi,
  unlinkReceiptRow,
} from "../../repositories/receiptRepository";
import {
  getTransactionRow,
  listTransactionHistoryRows,
  replaceYearTransactionRows,
  transactionHistoryToApi,
  transactionToApi,
} from "../../repositories/transactionRepository";
import { ReplaceYearTransactionsRequestSchema } from "../../schemas/transaction";
import { classifyAccount } from "../classification/classifyAccount";
import {
  McpToolModule,
  idArg,
  requireDb,
  textResult,
  yearProperty,
} from "./mcpToolKit";

const transactionItemProperties = {
  date: { type: "string", description: "日付（YYYY-MM-DD）" },
  description: { type: "string", description: "摘要" },
  amount: { type: "number", description: "符号つき税込金額" },
  account: { type: "string", description: "口座・支払手段など（任意）" },
  category: { type: "string", description: "勘定科目（任意、既定は未分類）" },
  income_type: {
    type: "string",
    enum: ["business", "real_estate", "other"],
    description: "所得区分（任意、既定は other）",
  },
  tax_category: { type: "string", description: "消費税の税区分（任意）" },
  fiscal_year: { type: "integer", description: "割り当て年度（任意、既定は置換対象年）" },
};

export const mcpLedgerTools: McpToolModule = {
  tools: [
    {
      name: "get_transaction",
      description: "帳簿DBの取引を1件返す（論理削除済みは含まない）。",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "取引ID" } },
        required: ["id"],
      },
    },
    {
      name: "get_transaction_history",
      description:
        "取引の変更履歴（作成・更新・削除の前後スナップショット）を新しい順に返す。削除済み取引の履歴も参照できる。",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "取引ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_transaction_receipts",
      description: "取引に紐付いている証憑（領収書画像）の一覧を返す。",
      inputSchema: {
        type: "object",
        properties: { transaction_id: { type: "integer", description: "取引ID" } },
        required: ["transaction_id"],
      },
    },
    {
      name: "replace_year_transactions",
      description:
        "指定年の帳簿取引を渡した一覧で置き換える（既存分は論理削除され、変更履歴に残る）。画面の年次保存と同じ操作で、件数が多い年の再構築に使う。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          transactions: {
            type: "array",
            description: "置き換え後の取引一覧",
            items: { type: "object", properties: transactionItemProperties },
          },
        },
        required: ["year", "transactions"],
      },
    },
    {
      name: "classify_batch",
      description:
        "複数の摘要の勘定科目をまとめて判定する（履歴→SystemOne→ルールの順、classify_account と同じ判定）。結果は入力と同じ順序で返る。",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "判定したい摘要の一覧",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "摘要" },
                amount: { type: "number", description: "金額（任意、判定の参考）" },
              },
            },
          },
        },
        required: ["items"],
      },
    },
    {
      name: "unlink_receipt",
      description: "証憑（file_id）と取引の紐付けを解除する。証憑そのものは消えない。",
      inputSchema: {
        type: "object",
        properties: { file_id: { type: "string", description: "証憑のファイルID" } },
        required: ["file_id"],
      },
    },
    {
      name: "get_receipt_content",
      description:
        "証憑（領収書画像）の実体を Base64 で返す。content_base64 を保存すれば画像ファイルとして復元できる。",
      inputSchema: {
        type: "object",
        properties: { file_id: { type: "string", description: "証憑のファイルID" } },
        required: ["file_id"],
      },
    },
  ],
  handlers: {
    get_transaction: async (args) => {
      const db = requireDb();
      const id = idArg(args, "id");
      const row = await getTransactionRow(db, id);
      if (!row) throw new Error(`取引が見つかりません: id=${id}`);
      return textResult({ transaction: transactionToApi(row) });
    },
    get_transaction_history: async (args) => {
      const db = requireDb();
      const id = idArg(args, "id");
      const rows = await listTransactionHistoryRows(db, id);
      return textResult({ history: rows.map(transactionHistoryToApi) });
    },
    list_transaction_receipts: async (args) => {
      const db = requireDb();
      const transactionId = idArg(args, "transaction_id");
      const rows = await listReceiptRowsForTransaction(db, transactionId);
      return textResult({ receipts: rows.map(receiptToApi) });
    },
    replace_year_transactions: async (args) => {
      const db = requireDb();
      const parsed = ReplaceYearTransactionsRequestSchema.safeParse({
        year: args["year"],
        transactions: args["transactions"],
      });
      if (!parsed.success) {
        throw new Error("year と transactions が必要です");
      }
      const { year, transactions } = parsed.data;
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new Error("year が不正です");
      }
      const values = transactions.map((body) => {
        const date = body.date ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error("date は YYYY-MM-DD 形式で指定してください");
        }
        if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
          throw new Error("amount は数値で指定してください");
        }
        return {
          date,
          fiscalYear:
            typeof body.fiscal_year === "number" && Number.isInteger(body.fiscal_year)
              ? body.fiscal_year
              : year,
          description: body.description ?? "",
          amount: Math.trunc(body.amount),
          account: body.account ?? "",
          category: body.category ? body.category : "未分類",
          incomeType: body.income_type ?? "other",
          taxCategory: body.tax_category ?? "",
        };
      });
      const rows = await replaceYearTransactionRows(db, year, values);
      return textResult({
        year,
        count: rows.length,
        transactions: rows.map(transactionToApi),
      });
    },
    classify_batch: async (args) => {
      const items = args["items"];
      if (!Array.isArray(items)) {
        throw new Error("items（摘要の一覧）が必要です");
      }
      const history = await loadClassificationHistory();
      const systemOne = createSystemOneClient(loadSystemOneConfig());
      const results = [];
      for (const item of items) {
        const rec = (typeof item === "object" && item !== null ? item : {}) as Record<
          string,
          unknown
        >;
        const description = rec["description"];
        if (typeof description !== "string" || description === "") {
          throw new Error("items の各要素に description（摘要）が必要です");
        }
        results.push(
          await classifyAccount(description, {
            history,
            systemOne,
            jevPromptOverride: getJevPromptOverride(),
            regexRulesOverride: getRegexRulesOverride(),
          }),
        );
      }
      return textResult({ results });
    },
    unlink_receipt: async (args) => {
      const db = requireDb();
      const fileId = args["file_id"];
      if (typeof fileId !== "string" || !fileId) throw new Error("file_id が必要です");
      const row = await unlinkReceiptRow(db, fileId);
      if (!row) throw new Error(`証憑が見つかりません: file_id=${fileId}`);
      return textResult({ receipt: receiptToApi(row) });
    },
    get_receipt_content: async (args) => {
      const db = requireDb();
      const fileId = args["file_id"];
      if (typeof fileId !== "string" || !fileId) throw new Error("file_id が必要です");
      // 台帳で所有者を確認できたファイルだけを返す（REST の配信と同じ IDOR 対策。
      // getReceiptRowByFileId はテナント文脈がある場合に自テナントの行だけを引く）。
      const row = await getReceiptRowByFileId(db, fileId);
      if (!row) throw new Error(`証憑が見つかりません: file_id=${fileId}`);
      const storage = createStorageClient(loadStorageConfig());
      const downloaded = await storage.download(receiptObjectKey(fileId));
      return textResult({
        file_id: fileId,
        mime_type: downloaded.mimeType,
        content_base64: downloaded.dataBase64,
      });
    },
  },
};
