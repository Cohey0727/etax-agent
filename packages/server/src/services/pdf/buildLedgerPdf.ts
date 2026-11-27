/**
 * buildLedgerPdf.ts — 帳簿（1年分の取引）を PDF 化する（services/pdf）。
 *
 * pdf-lib で A4 縦に表を組み立てる純粋な生成処理。日本語フォントの
 * バイト列は呼び出し側（loadJapaneseFont）が用意して渡す。
 * 列構成は帳簿画面と同じ: 日付 / 摘要 / 金額（税込） / 勘定科目 / 区分 / 出所。
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import { TransactionResponse } from "../../schemas/transaction";
import { toSingleLine } from "./pdfText";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 14.5;
const FONT_SIZE = 9;
const FOOTER_ZONE = 56;

const TEXT_COLOR = rgb(0.13, 0.13, 0.18);
const MUTED_COLOR = rgb(0.45, 0.45, 0.52);
const LINE_COLOR = rgb(0.82, 0.82, 0.88);
const ZEBRA_COLOR = rgb(0.965, 0.965, 0.985);

const INCOME_TYPE_LABELS: Record<string, string> = {
  business: "事業",
  real_estate: "不動産",
  other: "対象外",
};

interface Column {
  label: string;
  x: number;
  width: number;
  align: "left" | "right";
}

const COLUMNS: readonly Column[] = [
  { label: "日付", x: MARGIN, width: 64, align: "left" },
  { label: "摘要", x: MARGIN + 64, width: 186, align: "left" },
  { label: "金額（税込）", x: MARGIN + 250, width: 78, align: "right" },
  { label: "勘定科目", x: MARGIN + 328, width: 72, align: "left" },
  { label: "区分", x: MARGIN + 400, width: 34, align: "left" },
  { label: "出所", x: MARGIN + 434, width: CONTENT_WIDTH - 434, align: "left" },
];

/** 金額をカンマ区切りにする（負数は - を前置）。 */
function formatAmount(value: number): string {
  const digits = Math.abs(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return value < 0 ? `-${digits}` : digits;
}

/** 1行にして、列幅に収まるよう末尾を … で詰める。 */
function fitText(font: PDFFont, text: string, maxWidth: number): string {
  const line = toSingleLine(text);
  if (font.widthOfTextAtSize(line, FONT_SIZE) <= maxWidth) return line;
  const ellipsis = "…";
  let trimmed = line;
  while (trimmed.length > 0 && font.widthOfTextAtSize(trimmed + ellipsis, FONT_SIZE) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + ellipsis;
}

function drawCell(page: PDFPage, font: PDFFont, column: Column, baseline: number, text: string) {
  const fitted = fitText(font, text, column.width - 4);
  const x =
    column.align === "right"
      ? column.x + column.width - 2 - font.widthOfTextAtSize(fitted, FONT_SIZE)
      : column.x + 2;
  page.drawText(fitted, { x, y: baseline, size: FONT_SIZE, font, color: TEXT_COLOR });
}

/** 列見出しとその下罫を描く。戻り値は最初の行の上端 Y。 */
function drawHeader(page: PDFPage, font: PDFFont, top: number): number {
  const baseline = top - 11;
  for (const column of COLUMNS) {
    drawCell(page, font, column, baseline, column.label);
  }
  page.drawLine({
    start: { x: MARGIN, y: top - ROW_HEIGHT },
    end: { x: MARGIN + CONTENT_WIDTH, y: top - ROW_HEIGHT },
    thickness: 0.8,
    color: LINE_COLOR,
  });
  return top - ROW_HEIGHT;
}

function formatDateTime(date: Date): string {
  // 作成日時はサーバーのタイムゾーン（コンテナは UTC 既定）に依存せず、
  // 常に日本時間で印字する。
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * 帳簿 PDF を生成する。rows は日付順を前提とする（リポジトリの並び）。
 * 末尾に収入合計・支出合計・差引の集計を付ける。
 */
export async function buildLedgerPdf(
  rows: readonly TransactionResponse[],
  year: number,
  generatedAt: Date,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  // 表紙相当の見出し（1ページ目のみ）
  page.drawText(`帳簿（${year}年）`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 58,
    size: 15,
    font,
    color: TEXT_COLOR,
  });
  page.drawText(`作成: ${formatDateTime(generatedAt)} ・ 全 ${rows.length} 件`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 76,
    size: FONT_SIZE,
    font,
    color: MUTED_COLOR,
  });
  let rowTop = drawHeader(page, font, PAGE_HEIGHT - 88);

  if (rows.length === 0) {
    page.drawText("この年の取引はありません。", {
      x: MARGIN + 2,
      y: rowTop - 12,
      size: FONT_SIZE,
      font,
      color: MUTED_COLOR,
    });
    rowTop -= ROW_HEIGHT * 1.6;
  }

  rows.forEach((row, index) => {
    if (rowTop - ROW_HEIGHT < FOOTER_ZONE) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      rowTop = drawHeader(page, font, PAGE_HEIGHT - MARGIN);
    }
    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: rowTop - ROW_HEIGHT,
        width: CONTENT_WIDTH,
        height: ROW_HEIGHT,
        color: ZEBRA_COLOR,
      });
    }
    const baseline = rowTop - 10.5;
    const values = [
      row.date,
      row.description,
      formatAmount(row.amount),
      row.category,
      INCOME_TYPE_LABELS[row.income_type] ?? row.income_type,
      row.account,
    ];
    COLUMNS.forEach((column, i) => drawCell(page, font, column, baseline, values[i]));
    page.drawLine({
      start: { x: MARGIN, y: rowTop - ROW_HEIGHT },
      end: { x: MARGIN + CONTENT_WIDTH, y: rowTop - ROW_HEIGHT },
      thickness: 0.4,
      color: LINE_COLOR,
    });
    rowTop -= ROW_HEIGHT;
  });

  // 集計（金額列の右端にそろえる）
  const incomeTotal = rows.reduce((sum, r) => (r.amount > 0 ? sum + r.amount : sum), 0);
  const expenseTotal = rows.reduce((sum, r) => (r.amount < 0 ? sum - r.amount : sum), 0);
  if (rowTop - ROW_HEIGHT * 3.4 < FOOTER_ZONE) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    rowTop = PAGE_HEIGHT - MARGIN;
  }
  rowTop -= ROW_HEIGHT * 0.7;
  page.drawLine({
    start: { x: MARGIN, y: rowTop },
    end: { x: MARGIN + CONTENT_WIDTH, y: rowTop },
    thickness: 0.8,
    color: LINE_COLOR,
  });
  const amountColumn = COLUMNS[2];
  const totals: Array<[string, number]> = [
    ["収入合計", incomeTotal],
    ["支出合計", expenseTotal],
    ["差引", incomeTotal - expenseTotal],
  ];
  for (const [label, value] of totals) {
    rowTop -= ROW_HEIGHT;
    const baseline = rowTop - 3.5;
    page.drawText(label, {
      x: amountColumn.x - 64,
      y: baseline,
      size: FONT_SIZE,
      font,
      color: TEXT_COLOR,
    });
    const text = formatAmount(value);
    page.drawText(text, {
      x: amountColumn.x + amountColumn.width - 2 - font.widthOfTextAtSize(text, FONT_SIZE),
      y: baseline,
      size: FONT_SIZE,
      font,
      color: TEXT_COLOR,
    });
  }

  // フッター（全ページにページ番号）
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${pages.length}`;
    p.drawText(label, {
      x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(label, 8),
      y: 28,
      size: 8,
      font,
      color: MUTED_COLOR,
    });
    p.drawText("eTaxAgent 帳簿", { x: MARGIN, y: 28, size: 8, font, color: MUTED_COLOR });
  });

  return doc.save();
}
