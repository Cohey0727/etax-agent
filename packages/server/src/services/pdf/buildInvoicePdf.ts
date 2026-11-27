/**
 * buildInvoicePdf.ts — 請求書（適格請求書）を PDF 化する（services/pdf）。
 *
 * pdf-lib で A4 縦に組み立てる純粋な生成処理。日本語フォントのバイト列は
 * 呼び出し側（loadJapaneseFont）が用意して渡す。帳票の記載内容は
 * 消費税法57条の4第1項の6記載事項を満たす構成にする:
 *   1. 発行者の氏名又は名称及び登録番号（適格請求書の場合）
 *   2. 取引年月日（発行日）
 *   3. 取引内容（軽減対象は品目名に ※ を付け、欄外にその旨を注記）
 *   4. 税率ごとに区分した合計金額（税抜）及び適用税率
 *   5. 税率ごとに区分した消費税額等
 *   6. 交付を受ける事業者の氏名又は名称
 * 修正した適格請求書では、当初分の帳票番号との関連を題下に明示する。
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import { InvoiceResponse } from "../../schemas/invoice";
import { fitText, formatAmount, toSingleLine } from "./pdfText";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 15;
const FONT_SIZE = 9;
const FOOTER_ZONE = 56;

const TEXT_COLOR = rgb(0.13, 0.13, 0.18);
const MUTED_COLOR = rgb(0.45, 0.45, 0.52);
const LINE_COLOR = rgb(0.82, 0.82, 0.88);
const BAND_COLOR = rgb(0.94, 0.94, 0.97);

/** YYYY-MM-DD を「2026年11月26日」形式にする。形式が違う場合はそのまま返す。 */
function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/** 数量の表示（整数はそのまま、小数は末尾ゼロを落とす）。 */
function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** 幅に収まるフォントサイズ（交付先名・発行者名は省略せず縮めて収める）。 */
function fitSize(font: PDFFont, text: string, size: number, maxWidth: number, minSize = 6): number {
  const width = font.widthOfTextAtSize(toSingleLine(text), size);
  return width > maxWidth ? Math.max((size * maxWidth) / width, minSize) : size;
}

function drawLeft(page: PDFPage, font: PDFFont, x: number, y: number, text: string, size: number, color = TEXT_COLOR): void {
  page.drawText(toSingleLine(text), { x, y, size, font, color });
}

function drawRight(page: PDFPage, font: PDFFont, right: number, y: number, text: string, size: number, color = TEXT_COLOR): void {
  const line = toSingleLine(text);
  page.drawText(line, { x: right - font.widthOfTextAtSize(line, size), y, size, font, color });
}

interface Column {
  label: string;
  x: number;
  width: number;
  align: "left" | "right";
}

const COLUMNS: readonly Column[] = [
  { label: "品目", x: MARGIN, width: 216, align: "left" },
  { label: "数量", x: MARGIN + 216, width: 52, align: "right" },
  { label: "単位", x: MARGIN + 268, width: 40, align: "left" },
  { label: "単価（税抜）", x: MARGIN + 308, width: 88, align: "right" },
  { label: "金額（税抜）", x: MARGIN + 396, width: CONTENT_WIDTH - 396, align: "right" },
];

/** 明細表の見出しと罫を描く。戻り値は最初の行の上端 Y。 */
function drawTableHeader(page: PDFPage, font: PDFFont, top: number): number {
  const baseline = top - 11;
  for (const column of COLUMNS) {
    const text = fitText(font, column.label, column.width - 4, FONT_SIZE);
    const x =
      column.align === "right"
        ? column.x + column.width - 2 - font.widthOfTextAtSize(text, FONT_SIZE)
        : column.x + 2;
    page.drawText(text, { x, y: baseline, size: FONT_SIZE, font, color: MUTED_COLOR });
  }
  page.drawLine({
    start: { x: MARGIN, y: top - ROW_HEIGHT },
    end: { x: MARGIN + CONTENT_WIDTH, y: top - ROW_HEIGHT },
    thickness: 0.8,
    color: LINE_COLOR,
  });
  return top - ROW_HEIGHT;
}

/**
 * 請求書 PDF を生成する。invoice は発行済み（発行者スナップショットと
 * 帳票番号を持つ）前提。明細が多い場合は表を次ページへ続ける。
 */
export async function buildInvoicePdf(
  invoice: InvoiceResponse,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const issuer = invoice.issuer;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // 題と帳票番号・発行日
  y -= 20;
  drawLeft(page, font, MARGIN, y, "請求書", 20);
  drawRight(page, font, PAGE_WIDTH - MARGIN, y + 6, `請求書番号: ${invoice.document_number ?? ""}`, FONT_SIZE);
  drawRight(page, font, PAGE_WIDTH - MARGIN, y - 8, `発行日: ${formatDate(invoice.issue_date)}`, FONT_SIZE);
  y -= 16;
  if (invoice.corrects_document_number) {
    const note = invoice.is_qualified
      ? `※ 本書は、請求書番号 ${invoice.corrects_document_number} の修正した適格請求書です`
      : `※ 本書は、請求書番号 ${invoice.corrects_document_number} の修正分です`;
    drawLeft(page, font, MARGIN, y, note, FONT_SIZE, MUTED_COLOR);
    y -= 8;
  }

  // 交付先（左）と発行者（右）
  y -= 18;
  // 交付先名（左）と発行者名（右）は同じ行に並ぶため、それぞれ半分の幅に収める
  const counterpartyLabel = `${invoice.counterparty_name} 御中`;
  drawLeft(page, font, MARGIN, y, counterpartyLabel, fitSize(font, counterpartyLabel, 13, 250));
  if (issuer) {
    drawRight(page, font, PAGE_WIDTH - MARGIN, y + 2, issuer.name, fitSize(font, issuer.name, 11, 240));
  }
  y -= 14;
  if (invoice.counterparty_address) {
    drawLeft(page, font, MARGIN, y, fitText(font, invoice.counterparty_address, 250, FONT_SIZE), FONT_SIZE, MUTED_COLOR);
  }
  if (issuer) {
    const addressLine = issuer.zip_code ? `〒${issuer.zip_code} ${issuer.address}` : issuer.address;
    if (addressLine.trim()) {
      drawRight(page, font, PAGE_WIDTH - MARGIN, y, fitText(font, addressLine, 250, FONT_SIZE), FONT_SIZE, MUTED_COLOR);
    }
    if (invoice.is_qualified && issuer.invoice_number) {
      y -= 13;
      drawRight(page, font, PAGE_WIDTH - MARGIN, y, `登録番号: ${issuer.invoice_number}`, FONT_SIZE, MUTED_COLOR);
    }
  }

  // 請求金額の帯
  y -= 26;
  page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_WIDTH, height: 30, color: BAND_COLOR });
  drawLeft(page, font, MARGIN + 10, y + 2, "請求金額（税込）", 11);
  drawRight(page, font, PAGE_WIDTH - MARGIN - 10, y, `¥${formatAmount(invoice.totals.total)}`, 16);
  y -= 16;
  drawLeft(page, font, MARGIN + 10, y, `（うち消費税等 ¥${formatAmount(invoice.totals.tax_total)}）`, FONT_SIZE, MUTED_COLOR);
  if (invoice.due_date) {
    drawRight(page, font, PAGE_WIDTH - MARGIN - 10, y, `支払期限: ${formatDate(invoice.due_date)}`, FONT_SIZE);
  }

  // 明細表
  y -= 14;
  let rowTop = drawTableHeader(page, font, y);
  for (const line of invoice.lines) {
    if (rowTop - ROW_HEIGHT < FOOTER_ZONE + 120) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      rowTop = drawTableHeader(page, font, PAGE_HEIGHT - MARGIN);
    }
    const baseline = rowTop - 10.5;
    const itemLabel = line.is_reduced_rate ? `${line.item_name} ※` : line.item_name;
    const values = [
      itemLabel,
      formatQuantity(line.quantity),
      line.unit,
      formatAmount(line.unit_price),
      formatAmount(line.amount),
    ];
    COLUMNS.forEach((column, i) => {
      const text = fitText(font, values[i], column.width - 4, FONT_SIZE);
      const x =
        column.align === "right"
          ? column.x + column.width - 2 - font.widthOfTextAtSize(text, FONT_SIZE)
          : column.x + 2;
      page.drawText(text, { x, y: baseline, size: FONT_SIZE, font, color: TEXT_COLOR });
    });
    page.drawLine({
      start: { x: MARGIN, y: rowTop - ROW_HEIGHT },
      end: { x: MARGIN + CONTENT_WIDTH, y: rowTop - ROW_HEIGHT },
      thickness: 0.4,
      color: LINE_COLOR,
    });
    rowTop -= ROW_HEIGHT;
  }
  if (invoice.lines.length === 0) {
    drawLeft(page, font, MARGIN + 2, rowTop - 11, "明細はありません。", FONT_SIZE, MUTED_COLOR);
    rowTop -= ROW_HEIGHT;
  }
  if (invoice.lines.some((line) => line.is_reduced_rate)) {
    rowTop -= 4;
    drawLeft(page, font, MARGIN, rowTop - 9, "※は軽減税率対象品目です", FONT_SIZE, MUTED_COLOR);
    rowTop -= ROW_HEIGHT;
  }

  // 税率ごとの集計（記載事項 4・5）
  const summaryRows: Array<[string, string]> = [
    ...invoice.totals.groups.map(
      (group) =>
        [
          `${group.tax_rate_percent}%対象（税抜）`,
          `¥${formatAmount(group.subtotal)}（消費税 ¥${formatAmount(group.tax)}）`,
        ] as [string, string],
    ),
    ["小計（税抜）", `¥${formatAmount(invoice.totals.subtotal)}`],
    ["消費税額合計", `¥${formatAmount(invoice.totals.tax_total)}`],
    ["合計（税込）", `¥${formatAmount(invoice.totals.total)}`],
  ];
  if (rowTop - ROW_HEIGHT * (summaryRows.length + 2) < FOOTER_ZONE) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    rowTop = PAGE_HEIGHT - MARGIN;
  }
  rowTop -= ROW_HEIGHT * 0.6;
  page.drawLine({
    start: { x: MARGIN + CONTENT_WIDTH - 250, y: rowTop },
    end: { x: MARGIN + CONTENT_WIDTH, y: rowTop },
    thickness: 0.8,
    color: LINE_COLOR,
  });
  for (const [label, value] of summaryRows) {
    rowTop -= ROW_HEIGHT;
    drawLeft(page, font, MARGIN + CONTENT_WIDTH - 250, rowTop - 3.5, label, FONT_SIZE);
    drawRight(page, font, PAGE_WIDTH - MARGIN - 2, rowTop - 3.5, value, FONT_SIZE);
  }

  // 備考
  if (invoice.memo) {
    rowTop -= ROW_HEIGHT * 1.2;
    drawLeft(page, font, MARGIN, rowTop - 3.5, "備考", FONT_SIZE, MUTED_COLOR);
    for (const memoLine of invoice.memo.split("\n")) {
      rowTop -= ROW_HEIGHT;
      if (rowTop < FOOTER_ZONE) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        rowTop = PAGE_HEIGHT - MARGIN;
      }
      drawLeft(page, font, MARGIN, rowTop - 3.5, fitText(font, memoLine, CONTENT_WIDTH, FONT_SIZE), FONT_SIZE);
    }
  }

  // フッター（全ページ）
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${pages.length}`;
    drawRight(p, font, PAGE_WIDTH - MARGIN, 28, label, 8, MUTED_COLOR);
    drawLeft(p, font, MARGIN, 28, "eTaxAgent 請求書", 8, MUTED_COLOR);
  });

  return doc.save();
}
