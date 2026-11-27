/**
 * formPdfFitting.test.ts — 様式・請求書 PDF の1行の欄（氏名・フリガナ・住所・
 * 税務署名・屋号フリガナ・交付先名・発行者名）が、長い値でも枠からはみ出さない
 * ことの検証。下地は白紙の A4 で代用し、描画の呼び出し（文字列・位置・大きさ）を
 * 記録して、描いた文字列の右端・左端を枠の境界と比べる。
 * 日本語フォントはサーバーのデータフォルダから読み、無い環境では省略する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { EMPTY_XTX_TAXPAYER } from "@etax/shared";
import { buildBlueReturnPdf } from "../src/services/pdf/buildBlueReturnPdf";
import { buildDomicilePdf } from "../src/services/pdf/buildDomicilePdf";
import { buildInvoicePdf } from "../src/services/pdf/buildInvoicePdf";
import { buildReturnPdf } from "../src/services/pdf/buildReturnPdf";
import { BlueReturnFormValues } from "../src/services/pdf/businessStartFormValues";
import { DomicileFormValues } from "../src/services/pdf/domicileFormValues";
import { loadJapaneseFont } from "../src/services/pdf/loadJapaneseFont";
import { ReturnFormValues } from "../src/services/pdf/returnFormValues";
import { InvoiceResponse } from "../src/schemas/invoice";

interface DrawCall {
  page: PDFPage;
  text: string;
  left: number;
  right: number;
}

const calls: DrawCall[] = [];
const originalDrawText = PDFPage.prototype.drawText;

beforeAll(() => {
  PDFPage.prototype.drawText = function (this: PDFPage, text, options) {
    const font = options?.font as PDFFont | undefined;
    const size = options?.size ?? 0;
    const left = options?.x ?? 0;
    const width = font ? font.widthOfTextAtSize(text, size) : 0;
    const pageWidth = this.getSize().width;
    calls.push({ page: this, text, left: left / pageWidth, right: (left + width) / pageWidth });
    return originalDrawText.call(this, text, options);
  };
});

afterAll(() => {
  PDFPage.prototype.drawText = originalDrawText;
});

async function blankTemplate(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]);
  return doc.save();
}

function callFor(text: string): DrawCall {
  const call = calls.find((c) => c.text === text);
  if (!call) throw new Error(`描画されていません: ${text}`);
  return call;
}

const LONG_NAME = "長谷川口アレクサンダー・ジョナサン・ウィリアムズ";
const LONG_KANA = "ハセガワグチアレクサンダージョナサンウィリアムズ";
const LONG_ADDRESS = "東京都千代田区千代田一丁目1番1号 千代田パークサイドマンション1001号室";
const LONG_OFFICE = "東京上野税務";

describe("1行の欄は枠の幅に収める", () => {
  test("申告書（第一表・第二表）", async () => {
    const font = await loadJapaneseFont();
    if (!font) return;
    calls.length = 0;
    const values: ReturnFormValues = {
      year: 2025,
      amendment: false,
      submissionDate: "2026-03-01",
      taxpayer: {
        ...EMPTY_XTX_TAXPAYER,
        name: LONG_NAME,
        nameKana: LONG_KANA,
        address: LONG_ADDRESS,
        taxOfficeName: LONG_OFFICE,
        shopName: "ヤマダ商店",
      },
      amounts: {},
      otherCreditName: "",
      socialLabel: "社会保険料",
      socialPaid: 0,
      smallBusinessPaid: 0,
      lifePremiums: { newGeneral: 0, oldGeneral: 0, newPension: 0, oldPension: 0, newCareMedical: 0 },
      earthquakePremiums: { earthquake: 0, oldLongTerm: 0 },
      donationsPaid: 0,
    };
    await buildReturnPdf(values, await blankTemplate(2), font);
    const firstPage = calls[0]?.page;
    const page1 = calls.filter((c) => c.page === firstPage);
    const page2 = calls.filter((c) => c.page !== firstPage);
    // 第一表の氏名・フリガナ（右端は様式の右端 0.96 まで）と税務署名（右の欄の手前まで）
    for (const text of [LONG_NAME, LONG_KANA]) {
      expect(page1.find((c) => c.text === text)?.right ?? 1).toBeLessThanOrEqual(0.96);
    }
    expect(page1.find((c) => c.text === LONG_OFFICE)?.right ?? 1).toBeLessThanOrEqual(0.7);
    // 第二表の見出しブロック（住所・屋号・フリガナ・氏名。保険料の表の右端 0.494 まで）
    for (const text of [LONG_ADDRESS, LONG_NAME, LONG_KANA]) {
      expect(page2.find((c) => c.text === text)?.right ?? 1).toBeLessThanOrEqual(0.494);
    }
  });

  test("青色申告承認申請書", async () => {
    const font = await loadJapaneseFont();
    if (!font) return;
    calls.length = 0;
    const values: BlueReturnFormValues = {
      taxOfficeName: LONG_OFFICE,
      submission: null,
      nameKana: LONG_KANA,
      name: LONG_NAME,
      birth: null,
      shopNameKana: LONG_KANA + "ショウテン",
      shopName: "",
      occupation: "",
      domicileKindNumber: "5",
      phoneParts: [],
      zipFirst: "",
      zipSecond: "",
      address: "",
      otherZipFirst: "",
      otherZipSecond: "",
      otherPhoneParts: [],
      otherAddress: "",
      startYearEra: null,
      offices: [],
      incomeTypes: [],
      cancellationHas: null,
      cancellationDate: null,
      businessStartDate: null,
      inheritanceHas: null,
      inheritanceDate: null,
      predecessorName: "",
      bookkeeping: null,
      bookkeepingOther: "",
      books: [],
      otherNotes: "",
    };
    await buildBlueReturnPdf(values, await blankTemplate(1), font);
    // 入力欄の矩形（様式の AcroForm フィールド）の左右端
    expect(callFor(LONG_OFFICE).left).toBeGreaterThanOrEqual(0.158);
    expect(callFor(LONG_KANA).right).toBeLessThanOrEqual(0.503);
    expect(callFor(LONG_NAME).right).toBeLessThanOrEqual(0.502);
    expect(callFor(LONG_KANA + "ショウテン").right).toBeLessThanOrEqual(0.98);
  });

  test("納税地の異動申出書", async () => {
    const font = await loadJapaneseFont();
    if (!font) return;
    calls.length = 0;
    const values: DomicileFormValues = {
      taxOfficeName: LONG_OFFICE,
      submission: null,
      zipFirst: "",
      zipSecond: "",
      address: "",
      phoneParts: [],
      nameKana: LONG_KANA,
      name: LONG_NAME,
      birth: null,
      occupation: "",
      shopName: "",
      previousZipFirst: "",
      previousZipSecond: "",
      previousAddress: "",
    };
    await buildDomicilePdf(values, await blankTemplate(1), font);
    expect(callFor(LONG_OFFICE).left).toBeGreaterThanOrEqual(0.15);
    // 氏名・フリガナは生年月日の欄（0.72 付近から）の手前まで
    expect(callFor(LONG_KANA).right).toBeLessThanOrEqual(0.71);
    expect(callFor(LONG_NAME).right).toBeLessThanOrEqual(0.71);
  });

  test("請求書: 交付先名と発行者名が重ならない", async () => {
    const font = await loadJapaneseFont();
    if (!font) return;
    calls.length = 0;
    const counterparty = "株式会社ロングネームホールディングスジャパン東日本営業本部";
    const issuer = "ヤマダシステムズ・ソフトウェアエンジニアリング事務所";
    const invoice: InvoiceResponse = {
      id: 1,
      kind: "invoice",
      status: "issued",
      document_number: "2026-0001",
      issue_date: "2026-04-01",
      due_date: null,
      counterparty_name: counterparty,
      counterparty_address: "",
      is_qualified: false,
      tax_rounding: "floor",
      memo: "",
      corrects_document_id: null,
      corrects_document_number: null,
      issuer: { name: issuer, zip_code: "", address: "", invoice_number: "" },
      lines: [],
      totals: { groups: [], subtotal: 0, tax_total: 0, total: 0 },
      payment_status: "unpaid",
      settled_amount: 0,
      remaining_amount: 0,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    };
    await buildInvoicePdf(invoice, font);
    const left = callFor(`${counterparty} 御中`);
    const right = callFor(issuer);
    expect(left.right).toBeLessThan(right.left);
  });
});
