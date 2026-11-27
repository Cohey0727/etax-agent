/**
 * mcpSubmissionTools.ts — MCP の提出の記録まわりのツール（services/mcp）。
 *
 * 提出記録（受付番号・提出日）の一覧・保存・削除、変更履歴の閲覧、
 * 受信通知PDFの添付・取得と、申告書の紙イメージ PDF の生成。REST の
 * /api/filing-submissions/* と同じサービス（services/filingSubmission）を
 * 使うため、受付番号の記録で申告ステータスが「提出済み」に連動する仕様や、
 * 添付の重複チェックは MCP 経由でも同じに効く。ここで扱うのは提出の
 * 「記録」と確認用 PDF までで、e-Tax への送信そのものは MCP の対象外
 * （送信は本人が行う）。
 */
import {
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  computeManualIncomes,
  expandedWithholdingTotal,
  resolveTaxCreditInputs,
} from "@etax/shared";
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
import { buildReturnPdf } from "../pdf/buildReturnPdf";
import { loadJapaneseFont } from "../pdf/loadJapaneseFont";
import { loadReturnFormTemplate } from "../pdf/loadReturnFormTemplate";
import { buildReturnFormValues } from "../pdf/returnFormValues";
import { toTaxpayer } from "../etax/xtxInputs";
import { savedTaxpayerProfile } from "./mcpBusinessStartTools";
import {
  McpToolModule,
  agricultureArg,
  expandedIncomeArg,
  filingOptionsArg,
  filingTypeProperty,
  ledgerTransactions,
  mergeDeductionInputs,
  mergeTaxCreditInputs,
  miscIncomeArg,
  realEstateScaleProperty,
  requireDb,
  salaryIncomeArg,
  taxpayerArg,
  textResult,
  todayInTokyo,
  yearArg,
} from "./mcpToolKit";

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
    {
      name: "export_return_pdf",
      description:
        "申告書の紙イメージ PDF を生成し、{filename, pdf_base64} を返す。計算は export_xtx / income_tax と同じ（帳簿＋控除＋拡張所得）。taxpayer は省略でき、省略時は対象年の保存済みプロフィールを使う。生成物は確認用で、提出データは export_xtx を使う。配当・一時行の印字と第三表の描画は未対応（税額・合計には反映される）。",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "integer" },
          taxpayer: {
            type: "object",
            description: "納税者プロフィール（省略時は保存済みの値を使う）",
          },
          filing_type: filingTypeProperty,
          real_estate_business_scale: realEstateScaleProperty,
          deductions: { type: "object", description: "所得控除の入力（任意）" },
          tax_credits: { type: "object", description: "税額控除の入力（任意）" },
          misc_income: { type: "object", description: "雑所得の入力（任意）" },
          salary_income: { type: "object", description: "給与所得の入力（任意）" },
          expanded_income: {
            type: "object",
            description: "配当・一時・株式等譲渡の入力（任意、income_tax と同じ形）",
          },
          agriculture: { type: "object", description: "農業所得の入力（任意）" },
          withholding_tax: { type: "number", description: "源泉徴収税額（任意）" },
          prepaid_tax: { type: "number", description: "予定納税額（任意）" },
          original_third_period_tax: {
            type: "number",
            description: "修正申告時の当初の第3期分の税額（任意）",
          },
          amendment: { type: "boolean", description: "修正申告か（任意）" },
          submission_date: { type: "string", description: "提出日（YYYY-MM-DD、任意）" },
        },
        required: ["year"],
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
    export_return_pdf: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const taxpayer = taxpayerArg(
        args["taxpayer"] !== undefined ? args["taxpayer"] : await savedTaxpayerProfile(db, year),
      );
      // 計算は income_tax / export_xtx と同じ部品・同じ順序で行う。
      const tx = await ledgerTransactions(db, year);
      const agricultureInput = agricultureArg(args);
      const figures = computeCorrectedFigures(tx, year, {
        ...filingOptionsArg(args),
        agriculture: agricultureInput,
      });
      const miscIncome = miscIncomeArg(args);
      const salaryIncome = salaryIncomeArg(args);
      const manual = computeManualIncomes(
        year,
        salaryIncome,
        miscIncome,
        figures._detail.business_income +
          figures._detail.real_estate_income +
          figures._detail.agriculture_income,
      );
      const expandedInput = expandedIncomeArg(args);
      const expanded = expandedInput ? computeExpandedIncomes(expandedInput) : undefined;
      const deductions = mergeDeductionInputs(args["deductions"]);
      const baseTaxCredits = mergeTaxCreditInputs(args["tax_credits"]);
      const tax = computeIncomeTax({
        year,
        totalIncome:
          figures._detail.business_income +
          figures._detail.real_estate_income +
          figures._detail.agriculture_income +
          manual.total +
          (expanded?.comprehensiveAddition ?? 0),
        deductions,
        taxCredits: expanded ? resolveTaxCreditInputs(baseTaxCredits, expanded) : baseTaxCredits,
        separateTaxation: expanded
          ? {
              stockIncome: expanded.separateStockIncome,
              dividendIncome: expanded.separateDividendIncome,
            }
          : undefined,
      });
      const [template, font] = await Promise.all([
        loadReturnFormTemplate(),
        loadJapaneseFont(),
      ]);
      if (!template) {
        throw new Error(
          "申告書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
        );
      }
      if (!font) {
        throw new Error(
          "日本語フォントがサーバーに配置されていないため、紙イメージ PDF を生成できません。データフォルダの fonts へ IPAex ゴシック等を配置してください。",
        );
      }
      const amendment = args["amendment"] === true;
      const values = buildReturnFormValues({
        year,
        amendment,
        submissionDate:
          typeof args["submission_date"] === "string" ? args["submission_date"] : todayInTokyo(),
        taxpayer: toTaxpayer(taxpayer),
        figures,
        tax,
        miscIncome,
        salaryIncome,
        manual,
        deductionInputs: deductions,
        withholdingTax:
          (typeof args["withholding_tax"] === "number" ? args["withholding_tax"] : 0) +
          (expanded ? expandedWithholdingTotal(expanded) : 0),
        prepaidTax: typeof args["prepaid_tax"] === "number" ? args["prepaid_tax"] : 0,
        originalThirdPeriodTax:
          typeof args["original_third_period_tax"] === "number"
            ? args["original_third_period_tax"]
            : null,
      });
      let pdf: Uint8Array;
      try {
        pdf = await buildReturnPdf(values, template, font);
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "紙イメージ PDF の生成に失敗しました");
      }
      return textResult({
        filename: `shinkokusho-${year}${amendment ? "-shusei" : "-kakutei"}.pdf`,
        pdf_base64: Buffer.from(pdf).toString("base64"),
      });
    },
  },
};
