/**
 * formPdfExports.ts — 申告書の紙イメージと届出様式（開業届・青色申告承認申請書・
 * 納税地の異動申出書）の印刷用 PDF 生成の共通処理（services/pdf）。
 *
 * REST（usecases）と MCP（services/mcp）の両方から使う。様式テンプレート
 * と日本語フォントの読み込み、様式への値の流し込みをここへ集約し、
 * 呼び出し経路で生成結果がずれないようにする。生成するのは紙提出・確認
 * 用の PDF で、提出そのものは本人が行う。
 */
import { computeIncomeTaxFiling } from "@etax/shared";
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
import { BusinessError } from "../../lib/errors";
import { loadReturnFormTemplate } from "./loadReturnFormTemplate";
import { buildReturnFormValues } from "./returnFormValues";
import { buildReturnPdf } from "./buildReturnPdf";
import { IncomeTaxReturnRequest } from "../etax/xtxInputs";

/** 様式 PDF 生成まわりの業務エラー。status は REST 側の HTTP ステータスに対応する。 */
export class PdfFormError extends BusinessError {}

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

async function loadFontOrThrow(missingMessage = FONT_MISSING_MESSAGE): Promise<Uint8Array> {
  const font = await loadJapaneseFont();
  if (!font) throw new PdfFormError(503, missingMessage);
  return font;
}

async function buildOrThrow(
  build: () => Promise<Uint8Array>,
  failureMessage = "印刷用 PDF の生成に失敗しました",
): Promise<Uint8Array> {
  try {
    return await build();
  } catch (e) {
    throw new PdfFormError(400, e instanceof Error ? e.message : failureMessage);
  }
}

/**
 * 所得税の申告書（第一表）の紙イメージ PDF を生成する。計算は XTX 出力と同じ
 * computeIncomeTaxFiling。配当・一時行の印字と第三表の描画は扱わない（税額・
 * 合計には反映される。提出データは XTX を使う）。
 */
export async function buildReturnPdfExport(request: IncomeTaxReturnRequest): Promise<FormPdfExport> {
  const [template, font] = await Promise.all([
    loadTemplateOrThrow(
      loadReturnFormTemplate,
      "申告書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    ),
    loadFontOrThrow(
      "日本語フォントがサーバーに配置されていないため、紙イメージ PDF を生成できません。データフォルダの fonts へ IPAex ゴシック等を配置してください。",
    ),
  ]);
  const { filing } = request;
  const computed = computeIncomeTaxFiling(filing);
  const values = buildReturnFormValues({
    year: filing.year,
    amendment: request.amendment,
    submissionDate: request.submissionDate,
    taxpayer: request.taxpayer,
    figures: computed.figures,
    tax: computed.tax,
    miscIncome: filing.miscIncome,
    salaryIncome: filing.salaryIncome,
    manual: computed.manual,
    deductionInputs: filing.deductions,
    withholdingTax: request.withholdingTax + computed.expandedWithholding,
    prepaidTax: request.prepaidTax,
    originalThirdPeriodTax: request.originalThirdPeriodTax,
  });
  const pdf = await buildOrThrow(
    () => buildReturnPdf(values, template, font),
    "紙イメージ PDF の生成に失敗しました",
  );
  return {
    filename: `shinkokusho-${filing.year}${request.amendment ? "-shusei" : "-kakutei"}.pdf`,
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
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
