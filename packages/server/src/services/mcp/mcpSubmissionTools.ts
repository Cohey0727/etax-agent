/**
 * mcpSubmissionTools.ts — MCP の提出の記録まわりのツール（services/mcp）。
 *
 * 提出記録（受付番号・提出日）の一覧・保存・削除、変更履歴の閲覧、
 * 受信通知PDFの添付・取得。REST の /api/filing-submissions/* と同じ
 * サービス（services/filingSubmission）を使うため、受付番号の記録で
 * 申告ステータスが「提出済み」に連動する仕様や、添付の重複チェックは
 * MCP 経由でも同じに効く。ここで扱うのは提出の「記録」までで、
 * e-Tax への送信そのものは MCP の対象外（送信は本人が行う）。
 */
import {
  createStorageClient,
  filingReceiptObjectKey,
} from "../../gateways/storageGateway";
import { loadStorageConfig } from "../../lib/config";
import { isAllowedDocumentContentType, normalizeContentType } from "../../lib/uploadTypes";
import {
  filingSubmissionHistoryToApi,
  filingSubmissionToApi,
  listFilingSubmissionHistoryRows,
  listFilingSubmissionRows,
} from "../../repositories/filingSubmissionRepository";
import {
  FilingSubmissionKind,
  FilingSubmissionKindSchema,
  SaveFilingSubmissionRequestSchema,
} from "../../schemas/filingSubmission";
import {
  attachFilingReceiptRecord,
  deleteFilingSubmissionRecord,
  getFilingReceiptBytes,
  saveFilingSubmissionRecord,
} from "../filingSubmission/filingSubmissionRecords";
import { McpToolModule, requireDb, textResult, yearArg } from "./mcpToolKit";

const kindProperty = {
  type: "string",
  enum: ["income", "consumption"],
  description: "税目（income=所得税、consumption=消費税）",
};

function kindArg(args: Record<string, unknown>): FilingSubmissionKind {
  const parsed = FilingSubmissionKindSchema.safeParse(args["kind"]);
  if (!parsed.success) {
    throw new Error("kind が不正です（income か consumption を指定してください）");
  }
  return parsed.data;
}

export const mcpSubmissionTools: McpToolModule = {
  tools: [
    {
      name: "list_filing_submissions",
      description:
        "対象年の提出の記録（税目ごとの受付番号・提出日・受信通知の添付有無）を返す。",
      inputSchema: {
        type: "object",
        properties: { year: { type: "integer" } },
        required: ["year"],
      },
    },
    {
      name: "save_filing_submission",
      description:
        "提出の記録（受付番号・提出日）を保存する。受付番号を記録すると申告ステータスが「提出済み」に連動する。e-Tax への送信そのものは行わない（送信は本人の操作）。",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "integer" },
          kind: kindProperty,
          acceptance_number: {
            type: "string",
            description: "e-Tax の受付番号（受信通知に記載の番号）",
          },
          submitted_date: {
            type: "string",
            description: "提出日（YYYY-MM-DD、任意）",
          },
        },
        required: ["year", "kind", "acceptance_number"],
      },
    },
    {
      name: "delete_filing_submission",
      description:
        "提出の記録を削除する（添付済みの受信通知PDFの実体も消える）。削除の事実と前後の内容は変更履歴に残る。",
      inputSchema: {
        type: "object",
        properties: { year: { type: "integer" }, kind: kindProperty },
        required: ["year", "kind"],
      },
    },
    {
      name: "get_filing_submission_history",
      description:
        "提出の記録の変更履歴（登録・更新・削除と前後のスナップショット）を対象年分返す。電帳法の訂正・削除履歴の確認用。",
      inputSchema: {
        type: "object",
        properties: { year: { type: "integer" } },
        required: ["year"],
      },
    },
    {
      name: "attach_filing_receipt",
      description:
        "e-Tax の受信通知PDFを提出の記録へ添付する。content_base64 に PDF の Base64 を渡す（PDF 以外は受け付けない）。同じファイルの二重添付や、別の提出記録への使い回しはできない。",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "integer" },
          kind: kindProperty,
          content_base64: {
            type: "string",
            description: "受信通知PDFの Base64 エンコード済み内容",
          },
        },
        required: ["year", "kind", "content_base64"],
      },
    },
    {
      name: "get_filing_receipt_content",
      description:
        "提出の記録に添付済みの受信通知PDFを Base64 で返す（content_base64 を保存すれば PDF ファイルとして復元できる）。",
      inputSchema: {
        type: "object",
        properties: { year: { type: "integer" }, kind: kindProperty },
        required: ["year", "kind"],
      },
    },
  ],
  handlers: {
    list_filing_submissions: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const rows = await listFilingSubmissionRows(db, year);
      return textResult({ year, submissions: rows.map(filingSubmissionToApi) });
    },
    save_filing_submission: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const kind = kindArg(args);
      const parsed = SaveFilingSubmissionRequestSchema.safeParse({
        acceptance_number: args["acceptance_number"],
        submitted_date: args["submitted_date"] ?? null,
      });
      if (!parsed.success) {
        throw new Error("受付番号・提出日が不正です（提出日は YYYY-MM-DD）");
      }
      const submission = await saveFilingSubmissionRecord(db, year, kind, parsed.data);
      return textResult({ submission });
    },
    delete_filing_submission: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const kind = kindArg(args);
      await deleteFilingSubmissionRecord(db, year, kind);
      return textResult({ deleted: true, year, kind });
    },
    get_filing_submission_history: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const rows = await listFilingSubmissionHistoryRows(db, year);
      return textResult({ year, history: rows.map(filingSubmissionHistoryToApi) });
    },
    attach_filing_receipt: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const kind = kindArg(args);
      const contentBase64 = args["content_base64"];
      if (typeof contentBase64 !== "string" || contentBase64 === "") {
        throw new Error("content_base64（受信通知PDFの Base64）が必要です");
      }
      const bytes = Buffer.from(contentBase64, "base64");
      // 受信通知は PDF のみ。マジックバイトでも確認する（REST の形式検証と同等）。
      if (bytes.subarray(0, 4).toString("latin1") !== "%PDF") {
        throw new Error("対応していないファイル形式です（受信通知はPDFのみ添付できます）");
      }
      const mimeType = normalizeContentType("application/pdf");
      if (!isAllowedDocumentContentType(mimeType)) {
        throw new Error("対応していないファイル形式です（受信通知はPDFのみ添付できます）");
      }
      const fileId = crypto.randomUUID();
      const storage = createStorageClient(loadStorageConfig());
      await storage.save(filingReceiptObjectKey(fileId), bytes, mimeType);
      try {
        const submission = await attachFilingReceiptRecord(db, year, kind, fileId, mimeType);
        return textResult({ submission });
      } catch (e) {
        // 登録できなかった実体は孤児として残さない。
        await storage.deleteObject(filingReceiptObjectKey(fileId)).catch(() => undefined);
        throw e;
      }
    },
    get_filing_receipt_content: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const kind = kindArg(args);
      const result = await getFilingReceiptBytes(db, year, kind);
      return textResult({
        filename: result.filename,
        mime_type: result.mimeType,
        content_base64: result.dataBase64,
      });
    },
  },
};
