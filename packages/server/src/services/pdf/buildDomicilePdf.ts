/**
 * buildDomicilePdf.ts — 納税地の異動申出書の印刷用 PDF 生成（services/pdf）。
 *
 * 国税庁の公式様式（様式 1060）の1ページ目に、プロフィールの値をセル位置へ
 * 重ねて描く。座標は様式の印字文字・罫線位置から実測した比率で持ち、ページ
 * サイズに比例させる。2ページ目は様式の「書き方」のまま残す。
 * 提出日は生成時の日付（画面の提出日）を入れる。振替納税の欄は様式どおり
 * 空欄で、利用者が印刷後に○を付ける。
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { DomicileFormValues } from "./domicileFormValues";
import {
  DrawContext,
  drawCircle,
  drawText,
  drawTextFitted,
  drawTextRight,
  drawTextRightFitted,
} from "./pdfDraw";

/** 職業欄は狭いため、括弧書きがあればそこで、無ければ半分で2行に分ける。 */
function splitOccupation(occupation: string): readonly string[] {
  if (!occupation) return [];
  const paren = occupation.indexOf("（");
  if (paren > 0) return [occupation.slice(0, paren), occupation.slice(paren)];
  if (occupation.length > 12) {
    const half = Math.ceil(occupation.length / 2);
    return [occupation.slice(0, half), occupation.slice(half)];
  }
  return [occupation];
}

function drawForm(ctx: DrawContext, values: DomicileFormValues): void {
  // 提出先（＿＿税務署長）
  drawTextRightFitted(ctx, values.taxOfficeName, 0.2788, 0.18783, 11, 0.12);
  // 提出日（令和）
  if (values.submission) {
    drawTextRight(ctx, String(values.submission.reiwaYear), 0.17638, 0.22924, 10);
    drawTextRight(ctx, String(values.submission.month), 0.24528, 0.22924, 10);
    drawTextRight(ctx, String(values.submission.day), 0.31411, 0.22924, 10);
  }
  // 納税地（異動後）: 区分は「住所地」に○、郵便番号・住所・電話
  drawCircle(ctx, 0.5246, 0.13398, 0.02268, 0.008077);
  drawText(ctx, values.zipFirst, 0.52745, 0.1461, 10);
  drawText(ctx, values.zipSecond, 0.5812, 0.1461, 10);
  drawTextFitted(ctx, values.address, 0.50393, 0.16787, 10.5, 0.4117);
  const phoneX: readonly number[] = [0.75086, 0.80293, 0.85669];
  values.phoneParts.forEach((part, i) => {
    drawText(ctx, part, phoneX[i] ?? phoneX[0], 0.18053, 10);
  });
  // フリガナ・氏名・生年月日
  // 氏名・フリガナの右には生年月日の欄（0.72 付近から）がある
  drawTextFitted(ctx, values.nameKana, 0.50393, 0.26549, 10, 0.2);
  drawTextFitted(ctx, values.name, 0.50393, 0.29312, 12, 0.2);
  if (values.birth) {
    drawTextRight(
      ctx,
      `${values.birth.eraName}${values.birth.eraYear}`,
      0.78446,
      0.2861,
      9,
    );
    drawText(ctx, String(values.birth.month), 0.81469, 0.2861, 9.5);
    drawTextRight(ctx, String(values.birth.day), 0.86509, 0.2861, 8);
  }
  // 職業（2行まで）・屋号
  const occupationLines = splitOccupation(values.occupation);
  if (occupationLines.length === 1) {
    drawText(ctx, occupationLines[0], 0.50219, 0.33481, 9);
  } else if (occupationLines.length >= 2) {
    drawText(ctx, occupationLines[0], 0.50219, 0.3274, 8);
    drawText(ctx, occupationLines[1], 0.50219, 0.3399, 8);
  }
  drawTextFitted(ctx, values.shopName, 0.72566, 0.34032, 10, 0.19);
  // 1 納税地（1）異動・変更前: 郵便番号・住所、区分は「住所」に○
  drawText(ctx, values.previousZipFirst, 0.34268, 0.43412, 10);
  drawText(ctx, values.previousZipSecond, 0.38299, 0.43412, 10);
  drawTextFitted(ctx, values.previousAddress, 0.32924, 0.46121, 10.5, 0.4435);
  drawCircle(ctx, 0.74599, 0.44755, 0.01848, 0.008077);
}

/**
 * 公式様式 PDF（2ページ: 申出書・書き方）の1ページ目に値を重ねた PDF を返す。
 * templateBytes は loadDomicileFormTemplate で用意する。
 */
export async function buildDomicilePdf(
  values: DomicileFormValues,
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  // 国税庁の様式 PDF は権限管理のみの暗号化（空パスワード）のため、そのまま開く。
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  // 申告書の紙イメージと同様、フォントは丸ごと埋め込む（サブセット化で化けるため）。
  const font = await doc.embedFont(fontBytes, { subset: false });
  const first = doc.getPages()[0];
  const { width, height } = first.getSize();
  drawForm({ page: first, font, width, height, scale: height / 841.89 }, values);
  return doc.save();
}
