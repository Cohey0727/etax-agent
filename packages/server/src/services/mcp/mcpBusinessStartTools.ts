/**
 * mcpBusinessStartTools.ts — MCP の開業届・青色申告承認申請書・納税地の
 * 異動申出書まわりのツール（services/mcp）。
 *
 * 専用入力の取得・保存と、各様式の印刷用 PDF の生成。REST の
 * /api/business-start-inputs と /api/etax/export-*-pdf と同じリポジトリ・
 * サービス（services/pdf/formPdfExports）を使う。PDF の生成ツールは
 * taxpayer / inputs / submission_date を省略でき、省略時は保存済みの
 * 納税者プロフィールと専用入力、当日（JST）で補う。生成するのは紙提出・
 * 確認用の PDF で、提出そのものは本人が行う。
 */
import { Db } from "../../lib/db";
import { getBusinessStartInputRow, upsertBusinessStartInputRow } from "../../repositories/businessStartRepository";
import {
  findTaxpayerCarryRow,
  getTaxpayerProfileRow,
  taxpayerProfileToApi,
} from "../../repositories/taxpayerRepository";
import {
  BusinessStartInputs,
  BusinessStartInputsSchema,
  ExportBusinessStartPdfRequestSchema,
} from "../../schemas/businessStart";
import { ExportDomicilePdfRequestSchema } from "../../schemas/etax";
import { TaxpayerProfile } from "../../schemas/taxpayer";
import {
  buildBlueReturnPdfExport,
  buildDomicilePdfExport,
  buildOpeningNoticePdfExport,
} from "../pdf/formPdfExports";
import { McpToolModule, requireDb, textResult, todayInTokyo } from "./mcpToolKit";

const taxpayerProperty = {
  type: "object",
  description:
    "納税者プロフィール（get_taxpayer_profile と同じ形）。省略時は保存済みのプロフィールを使う",
};
const inputsProperty = {
  type: "object",
  description:
    "開業の専用入力（get_business_start_inputs と同じ形）。省略時は保存済みの入力を使う",
};
const submissionDateProperty = {
  type: "string",
  description: "提出日（YYYY-MM-DD）。省略時は当日（JST）",
};

/** 保存済みの納税者プロフィールを引く（対象年の行が無ければ引き継ぎ元）。 */
async function savedTaxpayer(db: Db): Promise<TaxpayerProfile> {
  const year = Number(todayInTokyo().slice(0, 4));
  const row =
    (await getTaxpayerProfileRow(db, year)) ?? (await findTaxpayerCarryRow(db, year));
  if (!row) {
    throw new Error(
      "納税者プロフィールが保存されていません（taxpayer 引数で渡すか、先に save_taxpayer_profile で保存してください）",
    );
  }
  return taxpayerProfileToApi(row);
}

/** 保存済みの開業の専用入力を引く（壊れていれば未保存として扱う。REST の取得と同じ）。 */
async function savedBusinessStartInputs(db: Db): Promise<BusinessStartInputs> {
  const row = await getBusinessStartInputRow(db);
  const parsed = row
    ? BusinessStartInputsSchema.safeParse(JSON.parse(row.state) as unknown)
    : null;
  if (!parsed?.success) {
    throw new Error(
      "開業の専用入力が保存されていません（inputs 引数で渡すか、先に save_business_start_inputs で保存してください）",
    );
  }
  return parsed.data;
}

/** 様式 PDF の引数を解決する（省略時は保存値・当日で補い、REST と同じ検証を通す）。 */
async function resolveBusinessStartPdfArgs(
  db: Db,
  args: Record<string, unknown>,
): Promise<{ taxpayer: TaxpayerProfile; inputs: BusinessStartInputs; submissionDate: string }> {
  const taxpayer =
    args["taxpayer"] !== undefined
      ? (args["taxpayer"] as TaxpayerProfile)
      : await savedTaxpayer(db);
  const inputs =
    args["inputs"] !== undefined
      ? (args["inputs"] as BusinessStartInputs)
      : await savedBusinessStartInputs(db);
  const parsed = ExportBusinessStartPdfRequestSchema.safeParse({
    submission_date: args["submission_date"] ?? todayInTokyo(),
    taxpayer,
    inputs,
  });
  if (!parsed.success) {
    throw new Error("様式 PDF の入力が不正です（taxpayer / inputs / submission_date を確認してください）");
  }
  return {
    taxpayer: parsed.data.taxpayer,
    inputs: parsed.data.inputs,
    submissionDate: parsed.data.submission_date,
  };
}

export const mcpBusinessStartTools: McpToolModule = {
  tools: [
    {
      name: "get_business_start_inputs",
      description:
        "開業届・青色申告承認申請書の専用入力（開業日、事業の概要、青色申告の開始年、給与等の状況など）を返す。未保存なら state は null。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "save_business_start_inputs",
      description:
        "開業届・青色申告承認申請書の専用入力を保存する（get_business_start_inputs で得た形の state を渡す）。",
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "object",
            description: "開業の専用入力（BusinessStartInputs と同じ形）",
          },
        },
        required: ["state"],
      },
    },
    {
      name: "export_opening_notice_pdf",
      description:
        "個人事業の開業・廃業等届出書（開業）の印刷用 PDF を生成し、{filename, pdf_base64} を返す。taxpayer / inputs / submission_date は省略でき、省略時は保存済みの値と当日で補う。提出そのものは行わない（紙提出・確認用）。",
      inputSchema: {
        type: "object",
        properties: {
          taxpayer: taxpayerProperty,
          inputs: inputsProperty,
          submission_date: submissionDateProperty,
        },
      },
    },
    {
      name: "export_blue_return_pdf",
      description:
        "所得税の青色申告承認申請書の印刷用 PDF を生成し、{filename, pdf_base64} を返す。引数の省略時の扱いは export_opening_notice_pdf と同じ。",
      inputSchema: {
        type: "object",
        properties: {
          taxpayer: taxpayerProperty,
          inputs: inputsProperty,
          submission_date: submissionDateProperty,
        },
      },
    },
    {
      name: "export_domicile_change_pdf",
      description:
        "納税地の異動・変更に関する申出書の印刷用 PDF を生成し、{filename, pdf_base64} を返す。taxpayer には異動前・異動後の納税地を含むプロフィールを渡す（省略時は保存済みを使う）。提出そのものは行わない。",
      inputSchema: {
        type: "object",
        properties: {
          taxpayer: taxpayerProperty,
          submission_date: submissionDateProperty,
        },
      },
    },
  ],
  handlers: {
    get_business_start_inputs: async () => {
      const db = requireDb();
      const row = await getBusinessStartInputRow(db);
      if (!row) return textResult({ state: null, updated_at: null });
      const parsed = BusinessStartInputsSchema.safeParse(JSON.parse(row.state) as unknown);
      return textResult({
        state: parsed.success ? parsed.data : null,
        updated_at: row.updatedAt.toISOString(),
      });
    },
    save_business_start_inputs: async (args) => {
      const db = requireDb();
      const parsed = BusinessStartInputsSchema.safeParse(args["state"]);
      if (!parsed.success) {
        throw new Error("開業の専用入力が不正です（get_business_start_inputs の形で渡してください）");
      }
      const row = await upsertBusinessStartInputRow(db, parsed.data);
      return textResult({
        state: parsed.data,
        updated_at: row.updatedAt.toISOString(),
      });
    },
    export_opening_notice_pdf: async (args) => {
      const db = requireDb();
      const { taxpayer, inputs, submissionDate } = await resolveBusinessStartPdfArgs(db, args);
      return textResult(await buildOpeningNoticePdfExport(taxpayer, inputs, submissionDate));
    },
    export_blue_return_pdf: async (args) => {
      const db = requireDb();
      const { taxpayer, inputs, submissionDate } = await resolveBusinessStartPdfArgs(db, args);
      return textResult(await buildBlueReturnPdfExport(taxpayer, inputs, submissionDate));
    },
    export_domicile_change_pdf: async (args) => {
      const db = requireDb();
      const taxpayer =
        args["taxpayer"] !== undefined
          ? (args["taxpayer"] as TaxpayerProfile)
          : await savedTaxpayer(db);
      const parsed = ExportDomicilePdfRequestSchema.safeParse({
        submission_date: args["submission_date"] ?? todayInTokyo(),
        taxpayer,
      });
      if (!parsed.success) {
        throw new Error("申出書の入力が不正です（taxpayer / submission_date を確認してください）");
      }
      return textResult(
        await buildDomicilePdfExport(parsed.data.taxpayer, parsed.data.submission_date),
      );
    },
  },
};
