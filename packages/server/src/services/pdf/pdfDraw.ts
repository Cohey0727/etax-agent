/**
 * pdfDraw.ts — 公式様式 PDF への値の重ね描きの共通部品（services/pdf）。
 *
 * 座標はすべてページ寸法に対する比率で持ち、ページサイズに比例させる。
 * フォントサイズは A4（595×842pt）換算で指定し、実ページへ直す倍率
 * （scale = height / 841.89）を掛ける。申告書・異動申出書・開業届・
 * 青色申告承認申請書の各 builder が共有する。
 */
import { PDFPage, PDFFont, rgb } from "pdf-lib";

export const FORM_INK = rgb(0.05, 0.05, 0.25);

export interface DrawContext {
  page: PDFPage;
  font: PDFFont;
  width: number;
  height: number;
  /** A4（595×842pt）換算のフォントサイズを実ページへ直す倍率。 */
  scale: number;
}

/** セル中心（上から比率 center）を、文字ベースラインの y 座標へ変換する。 */
function baseline(ctx: DrawContext, center: number, size: number): number {
  return ctx.height * (1 - center) - size * 0.35;
}

/** 左寄せで描く。空文字は描かない。 */
export function drawText(
  ctx: DrawContext,
  text: string,
  xRatio: number,
  center: number,
  size: number,
): void {
  if (!text) return;
  const s = size * ctx.scale;
  ctx.page.drawText(text, {
    x: xRatio * ctx.width,
    y: baseline(ctx, center, s),
    size: s,
    font: ctx.font,
    color: FORM_INK,
  });
}

/** 右端を揃えて描く。空文字は描かない。 */
export function drawTextRight(
  ctx: DrawContext,
  text: string,
  rightRatio: number,
  center: number,
  size: number,
): void {
  if (!text) return;
  const s = size * ctx.scale;
  const w = ctx.font.widthOfTextAtSize(text, s);
  ctx.page.drawText(text, {
    x: rightRatio * ctx.width - w,
    y: baseline(ctx, center, s),
    size: s,
    font: ctx.font,
    color: FORM_INK,
  });
}

/** 中央を揃えて描く。空文字は描かない。 */
export function drawTextCentered(
  ctx: DrawContext,
  text: string,
  centerRatio: number,
  center: number,
  size: number,
): void {
  if (!text) return;
  const s = size * ctx.scale;
  const w = ctx.font.widthOfTextAtSize(text, s);
  ctx.page.drawText(text, {
    x: centerRatio * ctx.width - w / 2,
    y: baseline(ctx, center, s),
    size: s,
    font: ctx.font,
    color: FORM_INK,
  });
}

/** 枠の幅（比率）に収まるフォントサイズ。収まるなら size のまま、下限は 4.2。 */
function fittedSize(ctx: DrawContext, text: string, size: number, maxWidthRatio: number): number {
  const width = ctx.font.widthOfTextAtSize(text, size * ctx.scale);
  return width > maxWidthRatio * ctx.width
    ? Math.max(size * ((maxWidthRatio * ctx.width) / width), 4.2)
    : size;
}

/** 枠の幅に収まるよう、必要ならフォントを縮めて左寄せで描く。 */
export function drawTextFitted(
  ctx: DrawContext,
  text: string,
  xRatio: number,
  center: number,
  size: number,
  maxWidthRatio: number,
): void {
  if (!text) return;
  drawText(ctx, text, xRatio, center, fittedSize(ctx, text, size, maxWidthRatio));
}

/** 枠の幅に収まるよう、必要ならフォントを縮めて右寄せで描く。 */
export function drawTextRightFitted(
  ctx: DrawContext,
  text: string,
  rightRatio: number,
  center: number,
  size: number,
  maxWidthRatio: number,
): void {
  if (!text) return;
  drawTextRight(ctx, text, rightRatio, center, fittedSize(ctx, text, size, maxWidthRatio));
}

/** 複数行テキストを、枠幅で折り返しながら行ごとに左寄せで描く。 */
export function drawMultilineText(
  ctx: DrawContext,
  text: string,
  xRatio: number,
  firstCenter: number,
  size: number,
  lineHeightRatio: number,
  maxWidthRatio: number,
  maxLines: number,
): void {
  const lines = wrapText(ctx, text, size, maxWidthRatio).slice(0, maxLines);
  lines.forEach((line, i) => {
    drawText(ctx, line, xRatio, firstCenter + i * lineHeightRatio, size);
  });
}

/** 枠幅に合わせて文字単位で折り返す簡易ラッパー（日本語は禁則処理なし）。 */
function wrapText(
  ctx: DrawContext,
  text: string,
  size: number,
  maxWidthRatio: number,
): string[] {
  const maxWidth = maxWidthRatio * ctx.width;
  const s = size * ctx.scale;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of paragraph) {
      const candidate = line + ch;
      if (line && ctx.font.widthOfTextAtSize(candidate, s) > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** 「○で囲む」欄の○を描く。中心と半径はページ寸法に対する比率。 */
export function drawCircle(
  ctx: DrawContext,
  cxRatio: number,
  cyTopRatio: number,
  rxRatio: number,
  ryRatio: number,
): void {
  ctx.page.drawEllipse({
    x: cxRatio * ctx.width,
    y: ctx.height * (1 - cyTopRatio),
    xScale: rxRatio * ctx.width,
    yScale: ryRatio * ctx.height,
    borderColor: FORM_INK,
    borderWidth: 1.1 * ctx.scale,
  });
}
