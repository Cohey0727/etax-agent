/**
 * formPdfExports.ts — 届出様式（開業届・青色申告承認申請書・納税地の
 * 異動申出書）の印刷用 PDF 生成の共通処理（services/pdf）。
 *
 * REST（usecases）と MCP（services/mcp）の両方から使う。様式テンプレート
 * と日本語フォントの読み込み、様式への値の流し込みをここへ集約し、
 * 呼び出し経路で生成結果がずれないようにする。生成するのは紙提出・確認
 * 用の PDF で、提出そのものは本人が行う。
 */
import { BusinessStartInputs } from "../../schemas/businessStart";
import { TaxpayerProfile } from "../../schemas/taxpayer";
import { buildBlueReturnPdf } from "./buildBlueReturnPdf";
import { buildDomicilePdf } from "./buildDomicilePdf";
import { buildOpeningNoticePdf } from "./buildOpeningNoticePdf";
import {
  buildBlueReturnFormValues,
  buildOpeningNoticeFormValues,
} from "./businessStartFormValues";
import { buildDomicileFormValues } from "./domicileFormValues";
import { loadBlueReturnFormTemplate } from "./loadBlueReturnFormTemplate";
import { loadDomicileFormTemplate } from "./loadDomicileFormTemplate";
import { loadJapaneseFont } from "./loadJapaneseFont";
import { loadOpeningNoticeFormTemplate } from "./loadOpeningNoticeFormTemplate";

/** 様式 PDF 生成まわりの業務エラー。status は REST 側の HTTP ステータスに対応する。 */
export class PdfFormError extends Error {
  readonly status: 400 | 503;

  constructor(status: 400 | 503, message: string) {
    super(message);
    this.name = "PdfFormError";
    this.status = status;
  }
}

export interface FormPdfExport {
  filename: string;
  pdf_base64: string;
}

const FONT_MISSING_MESSAGE =
  "日本語フォントがサーバーに配置されていないため、印刷用 PDF を生成できません。データフォルダの fonts へ IPAex ゴシック等を配置してください。";

async function loadTemplateOrThrow(
  load: () => Promise<Uint8Array | null>,
  missingMessage: string,
): Promise<Uint8Array> {
  const template = await load();
  if (!template) throw new PdfFormError(503, missingMessage);
  return template;
}

async function loadFontOrThrow(): Promise<Uint8Array> {
  const font = await loadJapaneseFont();
  if (!font) throw new PdfFormError(503, FONT_MISSING_MESSAGE);
  return font;
}

async function buildOrThrow(
  build: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  try {
    return await build();
  } catch (e) {
    throw new PdfFormError(
      400,
      e instanceof Error ? e.message : "印刷用 PDF の生成に失敗しました",
    );
  }
}

/** 個人事業の開業・廃業等届出書（開業）の印刷用 PDF を生成する。 */
export async function buildOpeningNoticePdfExport(
  taxpayer: TaxpayerProfile,
  inputs: BusinessStartInputs,
  submissionDate: string,
): Promise<FormPdfExport> {
  const [template, font] = await Promise.all([
    loadTemplateOrThrow(
      loadOpeningNoticeFormTemplate,
      "開業届の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    ),
    loadFontOrThrow(),
  ]);
  const values = buildOpeningNoticeFormValues(taxpayer, inputs, submissionDate);
  const pdf = await buildOrThrow(() => buildOpeningNoticePdf(values, template, font));
  return {
    filename: "kaigyo-todokede.pdf",
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
}

/** 所得税の青色申告承認申請書の印刷用 PDF を生成する。 */
export async function buildBlueReturnPdfExport(
  taxpayer: TaxpayerProfile,
  inputs: BusinessStartInputs,
  submissionDate: string,
): Promise<FormPdfExport> {
  const [template, font] = await Promise.all([
    loadTemplateOrThrow(
      loadBlueReturnFormTemplate,
      "青色申告承認申請書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    ),
    loadFontOrThrow(),
  ]);
  const values = buildBlueReturnFormValues(taxpayer, inputs, submissionDate);
  const pdf = await buildOrThrow(() => buildBlueReturnPdf(values, template, font));
  return {
    filename: "aoiro-shinkoku-shinsei.pdf",
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
}

/** 納税地の異動・変更に関する申出書の印刷用 PDF を生成する。 */
export async function buildDomicilePdfExport(
  taxpayer: TaxpayerProfile,
  submissionDate: string,
): Promise<FormPdfExport> {
  const [template, font] = await Promise.all([
    loadTemplateOrThrow(
      loadDomicileFormTemplate,
      "異動申出書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    ),
    loadFontOrThrow(),
  ]);
  const values = buildDomicileFormValues(taxpayer, submissionDate);
  const pdf = await buildOrThrow(() => buildDomicilePdf(values, template, font));
  return {
    filename: "nozeichi-idou-moshidesho.pdf",
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
}
