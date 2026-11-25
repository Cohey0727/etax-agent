/**
 * buildBlueReturnPdf.ts — 所得税の青色申告承認申請書の印刷用 PDF 生成（services/pdf）。
 *
 * 国税庁の公式様式（様式ID NTA1KOZ210010021）の各欄へ、プロフィールと
 * 専用入力の値を重ねて描く。座標は様式 PDF の入力フィールド矩形から
 * 実測した比率（テキスト欄）と、印字文字の位置から実測した比率
 * （○で囲む欄）で持ち、ページサイズに比例させる。
 * 納税地の区分は住所地（番号 5）を前提にする。税理士署名欄・税務署
 * 整理欄は様式どおり空欄。
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { BlueReturnFormValues } from "./businessStartFormValues";
import {
  DrawContext,
  drawCircle,
  drawMultilineText,
  drawText,
  drawTextFitted,
  drawTextRight,
} from "./pdfDraw";

/** 備付帳簿名の○の位置（様式の印字順。中心 x と半径 x は比率、y は行の中心）。 */
const BOOK_CIRCLES: readonly { key: string; cx: number; rx: number; row: 0 | 1 }[] = [
  { key: "cash_book", cx: 0.117, rx: 0.036, row: 0 },
  { key: "receivables_book", cx: 0.207, rx: 0.021, row: 0 },
  { key: "payables_book", cx: 0.262, rx: 0.021, row: 0 },
  { key: "expense_book", cx: 0.318, rx: 0.021, row: 0 },
  { key: "fixed_asset_book", cx: 0.398, rx: 0.033, row: 0 },
  { key: "deposit_book", cx: 0.505, rx: 0.036, row: 0 },
  { key: "notes_book", cx: 0.6, rx: 0.033, row: 0 },
  { key: "claims_debts_book", cx: 0.135, rx: 0.048, row: 1 },
  { key: "general_ledger", cx: 0.258, rx: 0.033, row: 1 },
  { key: "journal", cx: 0.333, rx: 0.021, row: 1 },
  { key: "receipt_voucher", cx: 0.388, rx: 0.027, row: 1 },
  { key: "payment_voucher", cx: 0.452, rx: 0.027, row: 1 },
  { key: "transfer_voucher", cx: 0.517, rx: 0.027, row: 1 },
  { key: "cash_simple_book", cx: 0.6, rx: 0.042, row: 1 },
  { key: "other", cx: 0.695, rx: 0.021, row: 1 },
];

const BOOK_ROW_CENTERS: readonly number[] = [0.7665, 0.7915];

function drawForm(ctx: DrawContext, values: BlueReturnFormValues): void {
  // 提出日（年は元号名＋元号年で記入する）
  if (values.submission) {
    drawTextFitted(
      ctx,
      `${values.submission.eraName}${values.submission.eraYear}`,
      0.225,
      0.1074,
      10,
      0.056,
    );
    drawText(ctx, String(values.submission.month), 0.31, 0.1071, 10);
    drawText(ctx, String(values.submission.day), 0.371, 0.1067, 10);
  }
  // 提出先（＿＿税務署長）
  drawTextRight(ctx, values.taxOfficeName, 0.33, 0.1329, 11);
  // 生年月日（元号・年・月・日）
  if (values.birth) {
    drawTextFitted(ctx, values.birth.eraName, 0.637, 0.1319, 9.5, 0.078);
    drawText(ctx, String(values.birth.eraYear), 0.726, 0.1328, 10);
    drawText(ctx, String(values.birth.month), 0.812, 0.1324, 10);
    drawText(ctx, String(values.birth.day), 0.899, 0.1326, 10);
  }
  // フリガナ・氏名・職業・屋号フリガナ・屋号
  drawText(ctx, values.nameKana, 0.161, 0.1638, 10);
  drawText(ctx, values.name, 0.161, 0.1935, 12);
  drawTextFitted(ctx, values.occupation, 0.638, 0.1626, 10, 0.335);
  drawText(ctx, values.shopNameKana, 0.636, 0.1941, 10);
  drawTextFitted(ctx, values.shopName, 0.639, 0.2247, 11, 0.335);
  // 納税地の区分（番号）
  drawText(ctx, values.domicileKindNumber, 0.13, 0.2259, 11);
  // 納税地: 郵便番号・電話番号・住所
  drawText(ctx, values.zipFirst, 0.292, 0.2558, 10);
  drawText(ctx, values.zipSecond, 0.42, 0.2552, 10);
  const phoneX: readonly number[] = [0.683, 0.796, 0.899];
  values.phoneParts.forEach((part, i) => {
    drawText(ctx, part, phoneX[i] ?? phoneX[0], 0.256, 10);
  });
  drawTextFitted(ctx, values.address, 0.29, 0.2869, 10.5, 0.682);
  // 納税地以外の住所地等: 郵便番号・電話番号・住所
  drawText(ctx, values.otherZipFirst, 0.29, 0.3178, 10);
  drawText(ctx, values.otherZipSecond, 0.42, 0.3175, 10);
  const otherPhoneX: readonly number[] = [0.682, 0.798, 0.903];
  values.otherPhoneParts.forEach((part, i) => {
    drawText(ctx, part, otherPhoneX[i] ?? otherPhoneX[0], 0.3175, 10);
  });
  drawTextFitted(ctx, values.otherAddress, 0.29, 0.3485, 10.5, 0.682);
  // 「◯年分以後の所得税の申告は、青色申告書によりたいので申請します」
  if (values.startYearEra) {
    drawTextRight(
      ctx,
      `${values.startYearEra.eraName}${values.startYearEra.eraYear}`,
      0.131,
      0.3797,
      11,
    );
  }
  // 1 事業所又は所得の基因となる資産の名称及びその所在地（最大2件）
  values.offices.slice(0, 2).forEach((office, i) => {
    const center = i === 0 ? 0.437 : 0.4592;
    drawTextFitted(ctx, office.name, 0.136, center, 10, 0.235);
    drawTextFitted(ctx, office.location, 0.464, center, 10, 0.49);
  });
  // 2 所得の種類（○で囲む）
  if (values.incomeTypes.includes("business")) drawCircle(ctx, 0.11, 0.4975, 0.042, 0.0115);
  if (values.incomeTypes.includes("real_estate")) drawCircle(ctx, 0.2475, 0.4975, 0.045, 0.0115);
  if (values.incomeTypes.includes("forest")) drawCircle(ctx, 0.355, 0.4975, 0.037, 0.0115);
  // 3 青色申告承認の取消し・取りやめの有無
  if (values.cancellationHas === true) {
    drawCircle(ctx, 0.077, 0.5405, 0.016, 0.01);
    if (values.cancellationDate) {
      drawTextRight(ctx, String(values.cancellationDate.eraYear), 0.374, 0.5483, 10);
      drawTextRight(ctx, String(values.cancellationDate.month), 0.456, 0.5487, 10);
      drawTextRight(ctx, String(values.cancellationDate.day), 0.542, 0.5469, 10);
    }
  }
  if (values.cancellationHas === false) drawCircle(ctx, 0.663, 0.5405, 0.016, 0.01);
  // 4 本年1月16日以後新たに業務を開始した場合、その開始した年月日
  if (values.businessStartDate) {
    drawTextRight(ctx, String(values.businessStartDate.eraYear), 0.63, 0.569, 10);
    drawTextRight(ctx, String(values.businessStartDate.month), 0.717, 0.569, 10);
    drawTextRight(ctx, String(values.businessStartDate.day), 0.806, 0.569, 10);
  }
  // 5 相続による事業承継の有無
  if (values.inheritanceHas === true) {
    drawCircle(ctx, 0.077, 0.601, 0.016, 0.01);
    if (values.inheritanceDate) {
      drawTextRight(ctx, String(values.inheritanceDate.eraYear), 0.329, 0.6185, 10);
      drawTextRight(ctx, String(values.inheritanceDate.month), 0.415, 0.6182, 10);
      drawTextRight(ctx, String(values.inheritanceDate.day), 0.503, 0.6177, 10);
    }
    drawTextFitted(ctx, values.predecessorName, 0.686, 0.6173, 10, 0.248);
  }
  if (values.inheritanceHas === false) drawCircle(ctx, 0.077, 0.646, 0.016, 0.01);
  // 6(1) 簿記方式（○で囲む）と「その他」の内容
  if (values.bookkeeping === "double") drawCircle(ctx, 0.115, 0.7135, 0.037, 0.0115);
  if (values.bookkeeping === "simple") drawCircle(ctx, 0.1955, 0.7135, 0.037, 0.0115);
  if (values.bookkeeping === "other") drawCircle(ctx, 0.263, 0.7135, 0.024, 0.0115);
  drawTextFitted(ctx, values.bookkeepingOther, 0.336, 0.7168, 10, 0.29);
  // 6(2) 備付帳簿名（○で囲む）
  for (const book of BOOK_CIRCLES) {
    if (values.books.includes(book.key)) {
      drawCircle(ctx, book.cx, BOOK_ROW_CENTERS[book.row], book.rx, 0.0105);
    }
  }
  // 6(3) その他
  drawMultilineText(ctx, values.otherNotes, 0.066, 0.836, 10, 0.0165, 0.908, 3);
}

/**
 * 公式様式 PDF（1ページ）に値を重ねた PDF を返す。
 * templateBytes は loadBlueReturnFormTemplate で用意する。
 */
export async function buildBlueReturnPdf(
  values: BlueReturnFormValues,
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const first = doc.getPages()[0];
  const { width, height } = first.getSize();
  drawForm({ page: first, font, width, height, scale: height / 841.89 }, values);
  return doc.save();
}
