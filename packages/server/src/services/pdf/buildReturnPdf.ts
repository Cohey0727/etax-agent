/**
 * buildReturnPdf.ts — 申告書第一表・第二表の「紙イメージ」PDF 生成（services/pdf）。
 *
 * 国税庁の公式様式 PDF（OCR 用・様式 ID 入り）を下地に、計算済みの値を
 * セル位置へ重ねて描く。座標は様式（令和7年分以降用）の罫線位置から
 * 実測した比率で持ち、ページサイズに比例させる。末尾に 0 が印字済みの
 * セル（課税所得の 000 など）は、印字分を除いた桁だけを描く。
 * これは確認用のイメージで、提出は XTX の e-Tax 取り込みで行う前提。
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, PDFFont, rgb } from "pdf-lib";
import { ReturnAmountKey, ReturnFormValues } from "./returnFormValues";

const INK = rgb(0.05, 0.05, 0.25);

/** 第一表の金額行の中心位置（ページ高さに対する比率、上から）。38 行共通グリッド。 */
const ROW_CENTERS: readonly number[] = [
  0.2392, 0.2578, 0.2763, 0.2949, 0.3135, 0.332, 0.3506, 0.3692, 0.3877, 0.4063, 0.4249,
  0.4434, 0.462, 0.4806, 0.4991, 0.5177, 0.5363, 0.5548, 0.5734, 0.592, 0.6105, 0.6291,
  0.6477, 0.6662, 0.6848, 0.7034, 0.7219, 0.7405, 0.7591, 0.7776, 0.7962, 0.8148, 0.8333,
  0.8519, 0.8705, 0.889, 0.9076, 0.9262,
];

interface AmountCell {
  row: number;
  side: "left" | "right";
  /** 様式に印字済みの末尾 0 の桁数。その分は描かない。 */
  zeros?: number;
  /** 合計など、0 でも描くセル。 */
  always?: boolean;
}

const AMOUNT_CELLS: Record<ReturnAmountKey, AmountCell> = {
  revBusiness: { row: 1, side: "left" },
  revAgriculture: { row: 2, side: "left" },
  revRealEstate: { row: 3, side: "left" },
  revSalary: { row: 5, side: "left" },
  revPension: { row: 6, side: "left" },
  revMiscBusiness: { row: 7, side: "left" },
  revMiscOther: { row: 8, side: "left" },
  incBusiness: { row: 12, side: "left" },
  incAgriculture: { row: 13, side: "left" },
  incRealEstate: { row: 14, side: "left" },
  incSalary: { row: 17, side: "left" },
  incPension: { row: 18, side: "left" },
  incMiscBusiness: { row: 19, side: "left" },
  incMiscOther: { row: 20, side: "left" },
  incMiscSubtotal: { row: 21, side: "left" },
  incTotal: { row: 23, side: "left", always: true },
  dedSocial: { row: 24, side: "left" },
  dedSmall: { row: 25, side: "left" },
  dedLife: { row: 26, side: "left" },
  dedEarthquake: { row: 27, side: "left" },
  dedWidowSingle: { row: 28, side: "left", zeros: 4 },
  dedWorkDisability: { row: 29, side: "left", zeros: 4 },
  dedSpouse: { row: 30, side: "left", zeros: 4 },
  dedDependents: { row: 31, side: "left", zeros: 4 },
  dedSpecialRelative: { row: 32, side: "left", zeros: 4 },
  dedBasic: { row: 33, side: "left", zeros: 4, always: true },
  dedSubtotal: { row: 34, side: "left", always: true },
  dedCasualty: { row: 35, side: "left" },
  dedMedical: { row: 36, side: "left" },
  dedDonations: { row: 37, side: "left" },
  dedTotal: { row: 38, side: "left", always: true },
  taxTaxable: { row: 1, side: "right", zeros: 3, always: true },
  taxBase: { row: 2, side: "right", always: true },
  creditDividend: { row: 3, side: "right" },
  creditOther: { row: 4, side: "right" },
  creditHousing: { row: 5, side: "right", zeros: 2 },
  creditPolitical: { row: 6, side: "right", zeros: 2 },
  creditSeismic: { row: 7, side: "right" },
  taxAfterCredits: { row: 8, side: "right", always: true },
  taxAfterCredits2: { row: 10, side: "right", always: true },
  taxReconstruction: { row: 11, side: "right" },
  taxTotal: { row: 12, side: "right", always: true },
  creditForeign: { row: 13, side: "right" },
  withholding: { row: 14, side: "right" },
  declaredTax: { row: 15, side: "right", always: true },
  prepaid: { row: 16, side: "right" },
  thirdPay: { row: 17, side: "right", zeros: 2 },
  thirdRefund: { row: 18, side: "right" },
  amendOriginal: { row: 19, side: "right" },
  amendIncrease: { row: 20, side: "right", zeros: 2 },
  blueDeduction: { row: 24, side: "right" },
  dueByDeadline: { row: 30, side: "right", zeros: 2 },
};

/** 金額列の右端（比率）。左列は第一表の左半分、右列は右半分。 */
const LEFT_EDGE = 0.4935;
const RIGHT_EDGE = 0.96;
/** 印字済み 0 の1桁分の幅（比率）。 */
const ZERO_WIDTH = 0.0195;

interface DrawContext {
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

function drawText(
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
    color: INK,
  });
}

function drawTextCentered(
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
    color: INK,
  });
}

function drawTextRight(
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
    color: INK,
  });
}

/** 金額を描く。印字済み 0 のあるセルは、その桁を落として右端もずらす。 */
function drawAmount(
  ctx: DrawContext,
  value: number,
  cell: AmountCell,
): void {
  const zeros = cell.zeros ?? 0;
  const scaled = zeros > 0 ? Math.floor(Math.abs(value) / 10 ** zeros) : Math.abs(value);
  const digits = String(scaled);
  const edge = (cell.side === "left" ? LEFT_EDGE : RIGHT_EDGE) - zeros * ZERO_WIDTH - 0.002;
  const center = ROW_CENTERS[cell.row - 1];
  if (value < 0) {
    // 還付側の修正前税額などは頭に △ を付ける（様式の注記どおり）。
    const s = 11 * ctx.scale;
    const w = ctx.font.widthOfTextAtSize(digits, s);
    drawTextRight(ctx, digits, edge, center, 11);
    ctx.page.drawText("△", {
      x: edge * ctx.width - w - 13 * ctx.scale,
      y: baseline(ctx, center, s),
      size: s,
      font: ctx.font,
      color: INK,
    });
    return;
  }
  drawTextRight(ctx, digits, edge, center, 11);
}

/** 令和表記の年月日。ISO 文字列を分解する（不正なら null）。 */
function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 生年月日の元号（1文字）と令和換算でない元号内の年を返す。 */
function eraOf(year: number): { era: string; eraYear: number } {
  if (year >= 2019) return { era: "令", eraYear: year - 2018 };
  if (year >= 1989) return { era: "平", eraYear: year - 1988 };
  if (year >= 1926) return { era: "昭", eraYear: year - 1925 };
  return { era: "大", eraYear: year - 1911 };
}

/** 枠の幅に収まるよう、必要ならフォントを縮めて左寄せで描く。 */
function drawTextFitted(
  ctx: DrawContext,
  text: string,
  xRatio: number,
  center: number,
  size: number,
  maxWidthRatio: number,
): void {
  if (!text) return;
  const width = ctx.font.widthOfTextAtSize(text, size * ctx.scale);
  const fitted = width > maxWidthRatio * ctx.width
    ? Math.max(size * ((maxWidthRatio * ctx.width) / width), 4.2)
    : size;
  drawText(ctx, text, xRatio, center, fitted);
}

function drawHeader(ctx: DrawContext, values: ReturnFormValues): void {
  const t = values.taxpayer;
  // 見出し: 令和◯年分 / 申告の種類（1=確定、2=修正）
  drawTextCentered(ctx, String(values.year - 2018), 0.2125, 0.0555, 13);
  drawTextCentered(ctx, values.amendment ? "2" : "1", 0.611, 0.0555, 13);
  // 提出日（令和）
  const sub = parseIsoDate(values.submissionDate);
  if (sub) {
    drawTextRight(ctx, String(sub.year - 2018), 0.303, 0.1016, 11);
    drawTextRight(ctx, String(sub.month), 0.373, 0.1016, 11);
    drawTextRight(ctx, String(sub.day), 0.42, 0.1016, 11);
  }
  // 提出先（税務署コード・税務署名）
  drawText(ctx, t.taxOfficeCode, 0.545, 0.1016, 9);
  drawText(ctx, t.taxOfficeName, 0.598, 0.1016, 12);
  // 生年月日
  const birth = parseIsoDate(t.birthDate);
  if (birth) {
    const { era, eraYear } = eraOf(birth.year);
    drawTextCentered(ctx, era, 0.833, 0.1217, 10.5);
    drawTextCentered(ctx, String(eraYear), 0.87, 0.1217, 10.5);
    drawTextCentered(ctx, String(birth.month), 0.907, 0.1217, 10.5);
    drawTextCentered(ctx, String(birth.day), 0.944, 0.1217, 10.5);
  }
  // 納税地の行: 郵便番号（印字済みの ― の前後に分けて描く）・個人番号
  const zipDigits = t.zipCode.replace(/\D/g, "");
  if (zipDigits.length === 7) {
    drawTextRight(ctx, zipDigits.slice(0, 3), 0.338, 0.1217, 11);
    drawText(ctx, zipDigits.slice(3), 0.352, 0.1217, 11);
  } else if (t.zipCode) {
    drawText(ctx, t.zipCode, 0.283, 0.1217, 11);
  }
  if (t.myNumber) drawSpacedDigits(ctx, t.myNumber, 0.4825, 0.0215, 0.1217, 10.5);
  // 住所・フリガナ・氏名
  const address = [t.address, t.addressLine2].filter(Boolean).join(" ");
  drawTextFitted(ctx, address, 0.14, 0.1436, 11, 0.465);
  drawText(ctx, t.nameKana, 0.7, 0.1436, 11);
  drawText(ctx, t.name, 0.7, 0.167, 13);
  // 1月1日の住所・職業・屋号
  drawTextFitted(ctx, t.jan1Address || address, 0.14, 0.1894, 11, 0.465);
  drawTextFitted(ctx, t.occupation, 0.7, 0.1894, 10.5, 0.11);
  drawTextFitted(ctx, t.shopName, 0.878, 0.1894, 10.5, 0.08);
  // 種別: 青色（青色控除がある場合）・修正
  if ((values.amounts.blueDeduction ?? 0) > 0) drawTextCentered(ctx, "1", 0.184, 0.211, 11);
  if (values.amendment) drawTextCentered(ctx, "1", 0.556, 0.211, 11);
  // 電話番号（ハイフン区切りの3部分を各欄へ）
  const phoneParts = t.phone.split("-");
  if (phoneParts.length === 3) {
    drawTextCentered(ctx, phoneParts[0], 0.798, 0.211, 10.5);
    drawTextCentered(ctx, phoneParts[1], 0.878, 0.211, 10.5);
    drawTextCentered(ctx, phoneParts[2], 0.94, 0.211, 10.5);
  } else if (t.phone) {
    drawText(ctx, t.phone, 0.762, 0.211, 10.5);
  }
}

/** 数字を1桁ずつ等間隔に描く（個人番号用）。 */
function drawSpacedDigits(
  ctx: DrawContext,
  digits: string,
  startRatio: number,
  stepRatio: number,
  center: number,
  size: number,
): void {
  const chars = digits.replace(/\D/g, "").split("");
  chars.forEach((ch, i) => {
    drawTextCentered(ctx, ch, startRatio + stepRatio * i + stepRatio / 2, center, size);
  });
}

function drawSecondPage(ctx: DrawContext, values: ReturnFormValues): void {
  const t = values.taxpayer;
  // 左上の見出しブロック
  const address = [t.address, t.addressLine2].filter(Boolean).join(" ");
  drawText(ctx, address, 0.118, 0.0643, 10.5);
  drawText(ctx, t.shopName, 0.118, 0.0785, 10.5);
  drawText(ctx, t.nameKana, 0.118, 0.0855, 7.5);
  drawText(ctx, t.name, 0.118, 0.0965, 11);

  // 保険料等の内訳表: 支払計の右端 0.359 / 年末調整等以外の右端 0.494
  const paidEdge = 0.359;
  const otherEdge = 0.494;
  const insuranceRow = (
    label: string,
    paid: number,
    center: number,
    labelSize = 10,
  ): void => {
    if (paid === 0) return;
    if (label) drawText(ctx, label, 0.066, center, labelSize);
    drawTextRight(ctx, String(paid), paidEdge, center, 10.5);
    drawTextRight(ctx, String(paid), otherEdge, center, 10.5);
  };
  insuranceRow(values.socialLabel, values.socialPaid, 0.1919);
  insuranceRow(
    "小規模企業共済等掛金",
    values.smallBusinessPaid,
    0.2135,
    8.5,
  );
  const life = values.lifePremiums;
  const premiumRow = (paid: number, center: number): void => {
    if (paid !== 0) {
      drawTextRight(ctx, String(paid), paidEdge, center, 10.5);
      drawTextRight(ctx, String(paid), otherEdge, center, 10.5);
    }
  };
  premiumRow(life.newGeneral, 0.2559);
  premiumRow(life.oldGeneral, 0.2746);
  premiumRow(life.newPension, 0.2922);
  premiumRow(life.oldPension, 0.3103);
  premiumRow(life.newCareMedical, 0.3295);
  premiumRow(values.earthquakePremiums.earthquake, 0.3491);
  premiumRow(values.earthquakePremiums.oldLongTerm, 0.3691);

  // 寄附金控除に関する事項: 寄附金（支払額）
  if (values.donationsPaid !== 0) {
    drawTextRight(ctx, String(values.donationsPaid), 0.955, 0.2834, 10.5);
  }
}

/**
 * 公式様式 PDF（2ページ: 第一表・第二表）の上に値を重ねた PDF を返す。
 * templateBytes は loadReturnFormTemplate で用意する。
 */
export async function buildReturnPdf(
  values: ReturnFormValues,
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  // 国税庁の様式 PDF は権限管理のみの暗号化（空パスワード）のため、そのまま開く。
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  // サブセット化はフォントによって化ける（Noto Sans JP で確認済み）ため、
  // 紙イメージではフォントを丸ごと埋め込む。
  const font = await doc.embedFont(fontBytes, { subset: false });
  const pages = doc.getPages();
  const first = pages[0];
  const { width, height } = first.getSize();
  const ctx1: DrawContext = { page: first, font, width, height, scale: height / 841.89 };
  drawHeader(ctx1, values);
  for (const [key, cell] of Object.entries(AMOUNT_CELLS) as [
    ReturnAmountKey,
    AmountCell,
  ][]) {
    const value = values.amounts[key];
    if (value === undefined) continue;
    if (value === 0 && !cell.always) continue;
    drawAmount(ctx1, value, cell);
  }
  if (values.otherCreditName && (values.amounts.creditOther ?? 0) > 0) {
    drawText(ctx1, values.otherCreditName, 0.545, ROW_CENTERS[3], 8);
  }
  if (pages.length > 1) {
    const second = pages[1];
    const size2 = second.getSize();
    drawSecondPage(
      {
        page: second,
        font,
        width: size2.width,
        height: size2.height,
        scale: size2.height / 841.89,
      },
      values,
    );
  }
  return doc.save();
}
