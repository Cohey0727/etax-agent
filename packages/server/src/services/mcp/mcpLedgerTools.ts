/**
 * mcpLedgerTools.ts — MCP の帳簿まわりのツール（services/mcp）。
 *
 * 取引の一覧・単件取得・登録・更新・削除・変更履歴・年度一括置換、科目の
 * 判定（1件・一括）と学習、証憑の一覧・紐付け・解除・実体の取得。REST の
 * /api/transactions/*、/api/classify/*、/api/receipts/* と同じリポジトリ/
 * サービスを使う。
 */
import { normalizeBusinessRatio } from "@etax/shared";
import { createStorageClient, receiptObjectKey } from "../../gateways/storageGateway";
import { loadStorageConfig } from "../../lib/config";
import { getDb } from "../../lib/db";
import { isAllowedUploadContentType, normalizeContentType } from "../../lib/uploadTypes";
import { recordClassification } from "../../repositories/classificationHistoryRepository";
import {
  getReceiptRowByFileId,
  linkReceiptRow,
  listReceiptRows,
  listReceiptRowsForTransaction,
  receiptToApi,
  unlinkReceiptRow,
} from "../../repositories/receiptRepository";
import {
  deleteTransactionRow,
  effectiveFiscalYear,
  getTransactionRow,
  listRecentTransactionHistoryRows,
  listTransactionHistoryRows,
  listTransactionRows,
  replaceYearTransactionRows,
  transactionHistoryToApi,
  transactionToApi,
} from "../../repositories/transactionRepository";
import { ReplaceYearTransactionsRequestSchema } from "../../schemas/transaction";
import { MAX_CLASSIFY_BATCH_ITEMS, classifyAccount } from "../classification/classifyAccount";
import { loadClassifyDeps } from "../classification/loadClassifyDeps";
import { buildLedgerPdf } from "../pdf/buildLedgerPdf";
import { loadJapaneseFont } from "../pdf/loadJapaneseFont";
import { analyzeReceiptDraft } from "../receipts/analyzeReceiptDraft";
import {
  TransactionInput,
  TransactionWriteResult,
  createTransaction,
  updateTransaction,
} from "../transactions/transactionWrites";
import {
  McpToolModule,
  idArg,
  numArg,
  parseIncomeType,
  requireDb,
  textResult,
  yearArg,
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
  business_ratio_percent: {
    type: "integer",
    minimum: 0,
    maximum: 100,
    description: "事業専用割合（家事按分、0〜100の整数。任意、既定は100）",
  },
  business_ratio_basis: { type: "string", description: "按分根拠のメモ（任意）" },
};

/** 取引の登録・更新の引数を、共通の本体（transactionWrites）の入力にする。型の違う値はエラーにする。 */
function transactionInputArg(args: Record<string, unknown>): TransactionInput {
  const text = (key: string): string | undefined => {
    const value = args[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw new Error(`${key} は文字列で渡してください`);
    return value;
  };
  return {
    date: text("date"),
    fiscalYear: typeof args["fiscal_year"] === "number" ? args["fiscal_year"] : undefined,
    description: text("description"),
    amount: args["amount"] === undefined ? undefined : numArg(args, "amount"),
    account: text("account"),
    category: text("category"),
    incomeType: parseIncomeType(args["income_type"]),
    taxCategory: text("tax_category"),
    businessRatioPercent:
      typeof args["business_ratio_percent"] === "number" ? args["business_ratio_percent"] : undefined,
    businessRatioBasis: text("business_ratio_basis"),
  };
}

/** 取引の保存結果をツールの結果にする（学習履歴に記録できなかったときは warning つき）。 */
function transactionResult(result: TransactionWriteResult) {
  return textResult({
    transaction: transactionToApi(result.transaction),
    ...(result.learningWarning ? { warning: result.learningWarning } : {}),
  });
}

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
      name: "list_transaction_history",
      description:
        "全取引の変更履歴（作成・更新・削除の前後スナップショット）を新しい順に返す。電帳法の訂正・削除履歴の確認用。limit は既定100・上限500。",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "取得件数（任意、既定100・上限500）" },
        },
      },
    },
    {
      name: "export_ledger_pdf",
      description:
        "指定年の帳簿 PDF を生成し、{filename, pdf_base64} を返す（帳簿画面の PDF ダウンロードと同じ内容）。",
      inputSchema: {
        type: "object",
        properties: { year: yearProperty },
        required: ["year"],
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
        "複数の摘要の勘定科目をまとめて判定する（履歴→SystemOne→ルールの順、classify_account と同じ判定）。1回に200件まで。結果は入力と同じ順序で返る。",
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
    {
      name: "upload_receipt",
      description:
        "領収書画像を証憑ストレージへアップロードし、file_id を返す（対応形式は JPEG/PNG/WebP/GIF）。続けて analyze_receipt（file_id 指定）で読み取り、link_receipt で取引へ紐付ける。",
      inputSchema: {
        type: "object",
        properties: {
          content_base64: {
            type: "string",
            description: "画像の Base64 エンコード済み内容（data: プレフィックスなし）",
          },
          content_type: {
            type: "string",
            description: "画像の MIME タイプ（image/jpeg、image/png、image/webp、image/gif）",
          },
        },
        required: ["content_base64", "content_type"],
      },
    },
    {
      name: "analyze_receipt",
      description:
        "領収書画像を読み取り（日付・金額・支払先・摘要）＋勘定科目の判定を行い、帳簿ドラフトを返す。file_id（upload_receipt の戻り）か、image_base64 + mime_type のどちらかを指定する。帳簿への追加は行わない（結果を見て add_transaction で登録する）。",
      inputSchema: {
        type: "object",
        properties: {
          file_id: { type: "string", description: "アップロード済みの証憑ファイルID" },
          image_base64: {
            type: "string",
            description: "画像の Base64 エンコード済み内容（file_id と排他）",
          },
          mime_type: {
            type: "string",
            description: "画像の MIME タイプ（image_base64 と組で指定）",
          },
        },
      },
    },
    {
      name: "list_transactions",
      description: "帳簿DBの取引を返す。year を指定するとその年だけに絞る。",
      inputSchema: {
        type: "object",
        properties: { year: { type: "integer", description: "対象年（西暦、任意）" } },
      },
    },
    {
      name: "add_transaction",
      description:
        "帳簿DBに取引を1件追加する。amount は符号つき税込金額（収入は正、支出は負、0 は不可）。category に未分類以外を指定すると分類の学習履歴にも記録される。",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "日付（YYYY-MM-DD）" },
          description: { type: "string", description: "摘要" },
          amount: { type: "number", description: "符号つき税込金額（0 以外）" },
          account: { type: "string", description: "口座・支払手段など（任意）" },
          category: { type: "string", description: "勘定科目（任意、既定は未分類）" },
          income_type: {
            type: "string",
            enum: ["business", "real_estate", "other"],
            description:
              "収入区分（任意。省略時は摘要と勘定科目から推定する: 家賃まわりは real_estate、科目が決まっていれば business、それ以外は other）",
          },
          tax_category: {
            type: "string",
            description: "消費税の税区分（任意。課税売上10% / 課対仕入10% / 非課売上 / 対象外 など）",
          },
          fiscal_year: {
            type: "integer",
            description: "割り当て年度（任意。既定は日付の年。日付と違う年へ計上する場合に指定）",
          },
          business_ratio_percent: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "事業専用割合（家事按分、0〜100の整数。任意、既定は100＝全額事業分）",
          },
          business_ratio_basis: {
            type: "string",
            description: "按分根拠のメモ（任意。例: 面積割合 20㎡/60㎡）",
          },
        },
        required: ["date", "description", "amount"],
      },
    },
    {
      name: "update_transaction",
      description:
        "帳簿DBの取引を部分更新する。id 以外は変更したい項目だけ渡す。category を未分類以外の別の科目に変えると分類の学習履歴にも記録される。",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "取引ID" },
          date: { type: "string" },
          fiscal_year: { type: "integer", description: "割り当て年度" },
          description: { type: "string" },
          amount: { type: "number" },
          account: { type: "string" },
          category: { type: "string" },
          income_type: { type: "string", enum: ["business", "real_estate", "other"] },
          tax_category: { type: "string" },
          business_ratio_percent: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "事業専用割合（家事按分、0〜100の整数）",
          },
          business_ratio_basis: { type: "string", description: "按分根拠のメモ" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_transaction",
      description: "帳簿DBの取引を1件削除する。",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "取引ID" } },
        required: ["id"],
      },
    },
    {
      name: "classify_account",
      description:
        "摘要から勘定科目を判定する（過去の学習履歴 → SystemOne → キーワードルールの順）。候補と確信度も返す。",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "摘要" },
          amount: { type: "number", description: "金額（任意、判定の参考）" },
        },
        required: ["description"],
      },
    },
    {
      name: "classify_feedback",
      description: "確定した勘定科目を学習履歴に記録する。次回以降の classify_account で優先される。",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "摘要" },
          account: { type: "string", description: "確定した勘定科目" },
        },
        required: ["description", "account"],
      },
    },
    {
      name: "list_receipts",
      description: "証憑（領収書画像）の一覧を返す。各証憑の解析結果と、紐付いている取引IDを含む。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "link_receipt",
      description: "証憑（file_id）を取引（transaction_id）へ紐付ける。帳簿から証憑を辿れるようにするための操作。",
      inputSchema: {
        type: "object",
        properties: {
          file_id: { type: "string", description: "証憑のファイルID" },
          transaction_id: { type: "number", description: "紐付け先の取引ID" },
        },
        required: ["file_id", "transaction_id"],
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
    list_transaction_history: async (args) => {
      const db = requireDb();
      const rawLimit = args["limit"];
      const limit =
        typeof rawLimit === "number" && Number.isInteger(rawLimit) && rawLimit > 0
          ? Math.min(rawLimit, 500)
          : 100;
      const rows = await listRecentTransactionHistoryRows(db, limit);
      return textResult({ count: rows.length, history: rows.map(transactionHistoryToApi) });
    },
    export_ledger_pdf: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const rows = await listTransactionRows(db);
      const yearRows = rows
        .filter((r) => effectiveFiscalYear(r) === year)
        .map(transactionToApi);
      const fontBytes = await loadJapaneseFont();
      if (!fontBytes) {
        throw new Error(
          "PDF用の日本語フォントがサーバーに配置されていません。データフォルダの fonts/ に日本語フォント（ipaexg.ttf 等）を置いてください。",
        );
      }
      const pdf = await buildLedgerPdf(yearRows, year, new Date(), fontBytes);
      return textResult({
        filename: `ledger-${year}.pdf`,
        pdf_base64: Buffer.from(pdf).toString("base64"),
      });
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
          businessRatioPercent: normalizeBusinessRatio(body.business_ratio_percent),
          businessRatioBasis: body.business_ratio_basis ?? "",
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
      if (items.length > MAX_CLASSIFY_BATCH_ITEMS) {
        throw new Error(`items は${MAX_CLASSIFY_BATCH_ITEMS}件までにしてください`);
      }
      const deps = await loadClassifyDeps();
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
        results.push(await classifyAccount(description, deps));
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
    upload_receipt: async (args) => {
      const contentBase64 = args["content_base64"];
      const contentType = args["content_type"];
      if (typeof contentBase64 !== "string" || contentBase64 === "") {
        throw new Error("content_base64（画像の Base64）が必要です");
      }
      if (typeof contentType !== "string" || !isAllowedUploadContentType(contentType)) {
        throw new Error(
          "対応していないファイル形式です（領収書画像は JPEG/PNG/WebP/GIF のみ）",
        );
      }
      const mimeType = normalizeContentType(contentType);
      const bytes = Buffer.from(contentBase64, "base64");
      const fileId = crypto.randomUUID();
      const storage = createStorageClient(loadStorageConfig());
      await storage.save(receiptObjectKey(fileId), bytes, mimeType);
      return textResult({ file_id: fileId, mime_type: mimeType });
    },
    analyze_receipt: async (args) => {
      const fileId = args["file_id"];
      const imageBase64 = args["image_base64"];
      const mimeType = args["mime_type"];
      const result = await analyzeReceiptDraft(getDb(), {
        fileId: typeof fileId === "string" && fileId !== "" ? fileId : undefined,
        imageBase64:
          typeof imageBase64 === "string" && imageBase64 !== "" ? imageBase64 : undefined,
        mimeType: typeof mimeType === "string" && mimeType !== "" ? mimeType : undefined,
      });
      return textResult(result);
    },
    list_transactions: async (args) => {
      const db = requireDb();
      const year = args["year"] === undefined ? undefined : yearArg(args);
      const rows = await listTransactionRows(db, undefined, year);
      return textResult({
        count: rows.length,
        transactions: rows.map(transactionToApi),
      });
    },
    add_transaction: async (args) => {
      const db = requireDb();
      if (typeof args["date"] !== "string") throw new Error("date は YYYY-MM-DD 形式で渡してください");
      if (typeof args["description"] !== "string") {
        throw new Error("description（摘要）は文字列で渡してください");
      }
      if (args["amount"] === undefined || args["amount"] === null) {
        throw new Error("amount（符号つき税込金額）が必要です");
      }
      const result = await createTransaction(db, transactionInputArg(args), { learn: true });
      return transactionResult(result);
    },
    update_transaction: async (args) => {
      const db = requireDb();
      const id = idArg(args, "id");
      const result = await updateTransaction(db, id, transactionInputArg(args), { learn: true });
      if (!result) throw new Error(`取引が見つかりません: id=${id}`);
      return transactionResult(result);
    },
    delete_transaction: async (args) => {
      const db = requireDb();
      const id = idArg(args, "id");
      const row = await deleteTransactionRow(db, id);
      if (!row) throw new Error(`取引が見つかりません: id=${id}`);
      return textResult({ deleted: transactionToApi(row) });
    },
    classify_account: async (args) => {
      const description = args["description"];
      if (typeof description !== "string" || description === "") {
        throw new Error("description（摘要）が必要です");
      }
      return textResult(await classifyAccount(description, await loadClassifyDeps()));
    },
    classify_feedback: async (args) => {
      const description = args["description"];
      const account = args["account"];
      if (typeof description !== "string" || description === "" || typeof account !== "string" || account === "") {
        throw new Error("description（摘要）と account（勘定科目）が必要です");
      }
      await recordClassification(description, account);
      return textResult({ ok: true });
    },
    list_receipts: async () => {
      const db = requireDb();
      const rows = await listReceiptRows(db);
      return textResult({ receipts: rows.map(receiptToApi) });
    },
    link_receipt: async (args) => {
      const db = requireDb();
      const fileId = args["file_id"];
      if (typeof fileId !== "string" || !fileId) throw new Error("file_id が必要です");
      const row = await linkReceiptRow(db, fileId, idArg(args, "transaction_id"));
      return textResult({ receipt: row ? receiptToApi(row) : null });
    },
  },
};
