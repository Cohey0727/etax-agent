/**
 * buildOpeningNoticePdf.ts — 個人事業の開業・廃業等届出書の印刷用 PDF 生成（services/pdf）。
 *
 * 国税庁の公式様式（様式ID NTA1KOZ060010040）の各欄へ、プロフィールと
 * 専用入力の値を重ねて描く。座標は様式 PDF の入力フィールド矩形から
 * 実測した比率で持ち、ページサイズに比例させる。
 * 本 builder は「開業」の届出専用（廃業・新増設等の欄は描かない）。
 * 納税地の区分は住所地（番号 5）を前提にする。税理士署名欄・税務署
 * 整理欄は様式どおり空欄。
 * チェックボックスは様式側の注釈の外観（白塗り）がページ描画を覆うため、
 * 描画ではなく AcroForm フィールドのチェック状態で表す。
 */
import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import {
  OpeningNoticeFormValues,
  SalaryRowValues,
} from "./businessStartFormValues";
import {
  DrawContext,
  drawMultilineText,
  drawText,
  drawTextFitted,
  drawTextRight,
  drawTextRightFitted,
} from "./pdfDraw";

/** チェックボックスのフィールド名（様式 r06 の注釈名）。 */
const CHECK_FIELDS = {
  incomeRealEstate: "Check Box75",
  incomeForest: "Check Box76",
  incomeBusiness: "Check Box77",
  submitsBlueYes: "Check Box71",
  submitsBlueNo: "Check Box73",
  submitsConsumptionYes: "Check Box72",
  submitsConsumptionNo: "Check Box74",
  salaryFamilyTaxYes: "Check Box70",
  salaryFamilyTaxNo: "Check Box69",
  salaryEmployeeTaxYes: "Check Box67",
  salaryEmployeeTaxNo: "Check Box68",
  salaryOtherTaxYes: "Check Box66",
  salaryOtherTaxNo: "Check Box65",
  withholdingSpecialYes: "Check Box63",
  withholdingSpecialNo: "Check Box64",
} as const;

type MarkCheckBox = (fieldName: string) => void;

/**
 * チェックしたボックスの表示を、様式既定の ZapfDingbats グリフから
 * 線分で描くレ点へ差し替える。様式の on 状態の外観は白塗り＋フォントの
 * グリフで、ビューア側に ZapfDingbats が無いとレ点が表示されないため、
 * フィールドのチェック状態（/V・/AS）はそのままに、外観ストリームの
 * 中身だけをフォント非依存の描画へ置き換える。
 */
function checkFieldWithVectorAppearance(doc: PDFDocument, fieldName: string): void {
  const field = doc.getForm().getCheckBox(fieldName);
  field.check();
  for (const widget of field.acroField.getWidgets()) {
    const appearance = widget.dict.lookup(PDFName.of("AP"));
    if (!(appearance instanceof PDFDict)) continue;
    const normal = appearance.lookup(PDFName.of("N"));
    const state = widget.dict.get(PDFName.of("AS"));
    if (!(normal instanceof PDFDict) || !(state instanceof PDFName)) continue;
    const stream = normal.lookup(state);
    if (!(stream instanceof PDFRawStream)) continue;
    const bbox = stream.dict.get(PDFName.of("BBox"));
    if (!(bbox instanceof PDFArray)) continue;
    const width = (bbox.get(2) as PDFNumber).asNumber();
    const height = (bbox.get(3) as PDFNumber).asNumber();
    const f = (n: number) => n.toFixed(2);
    const content = [
      "q",
      "1 g",
      `0 0 ${f(width)} ${f(height)} re`,
      "f",
      `0.5 0.5 ${f(width - 1)} ${f(height - 1)} re`,
      "s",
      "Q",
      "q",
      "0 g",
      "2.2 w",
      "1 J",
      "2 j",
      `${f(width * 0.24)} ${f(height * 0.47)} m`,
      `${f(width * 0.43)} ${f(height * 0.26)} l`,
      `${f(width * 0.79)} ${f(height * 0.73)} l`,
      "S",
      "Q",
      "",
    ].join("\n");
    const replacement = doc.context.flateStream(content, {
      Type: PDFName.of("XObject"),
      Subtype: PDFName.of("Form"),
      FormType: 1,
      BBox: bbox,
      Resources: doc.context.obj({ ProcSet: [PDFName.of("PDF")] }),
    });
    normal.set(state, doc.context.register(replacement));
  }
}

/** 給与等の支払の状況の1行を描く。 */
function drawSalaryRow(
  ctx: DrawContext,
  row: SalaryRowValues,
  center: number,
  taxFields: { yes: string; no: string },
  markCheckBox: MarkCheckBox,
): void {
  if (row.count !== null) {
    drawTextRight(ctx, String(row.count), 0.212, center, 10);
  }
  drawTextFitted(ctx, row.terms, 0.254, center, 10, 0.19);
  if (row.hasTax === true) markCheckBox(taxFields.yes);
  if (row.hasTax === false) markCheckBox(taxFields.no);
}

function drawForm(
  ctx: DrawContext,
  values: OpeningNoticeFormValues,
  markCheckBox: MarkCheckBox,
): void {
  // 提出日（年は元号名＋元号年で記入する）
  if (values.submission) {
    drawTextFitted(
      ctx,
      `${values.submission.eraName}${values.submission.eraYear}`,
      0.05,
      0.0936,
      10,
      0.049,
    );
    drawText(ctx, String(values.submission.month), 0.12, 0.0941, 10);
    drawText(ctx, String(values.submission.day), 0.181, 0.0939, 10);
  }
  // 提出先（＿＿税務署長）
  drawTextRightFitted(ctx, values.taxOfficeName, 0.338, 0.1151, 11, 0.18);
  // マイナンバー（個人番号）
  drawText(ctx, values.myNumber, 0.548, 0.1151, 11);
  // フリガナ・氏名
  drawTextFitted(ctx, values.nameKana, 0.155, 0.1439, 10, 0.255);
  drawTextFitted(ctx, values.name, 0.155, 0.1724, 12, 0.255);
  // 生年月日（元号・年・月・日）
  if (values.birth) {
    drawTextFitted(ctx, values.birth.eraName, 0.509, 0.1495, 9.5, 0.048);
    drawText(ctx, String(values.birth.eraYear), 0.565, 0.15, 10);
    drawText(ctx, String(values.birth.month), 0.601, 0.1498, 10);
    drawText(ctx, String(values.birth.day), 0.638, 0.15, 10);
  }
  // 屋号フリガナ（K03）
  drawTextFitted(ctx, values.shopNameKana, 0.767, 0.144, 10, 0.172);
  // 職業・屋号
  drawTextFitted(ctx, values.occupation, 0.51, 0.1726, 10, 0.155);
  drawTextFitted(ctx, values.shopName, 0.767, 0.1724, 11, 0.172);
  // 納税地の区分（番号）
  drawText(ctx, values.domicileKindNumber, 0.163, 0.2022, 11);
  // 電話番号（3部分）
  const phoneX: readonly number[] = [0.512, 0.67, 0.831];
  values.phoneParts.forEach((part, i) => {
    drawText(ctx, part, phoneX[i] ?? phoneX[0], 0.2027, 10);
  });
  // 納税地: 郵便番号・住所
  drawText(ctx, values.zipFirst, 0.192, 0.2323, 10);
  drawText(ctx, values.zipSecond, 0.319, 0.2321, 10);
  drawTextFitted(ctx, values.address, 0.51, 0.2321, 10.5, 0.43);
  // 上記以外の住所地・事業所等: 郵便番号・住所
  drawText(ctx, values.otherZipFirst, 0.191, 0.2655, 10);
  drawText(ctx, values.otherZipSecond, 0.317, 0.2658, 10);
  drawTextFitted(ctx, values.otherAddress, 0.51, 0.2658, 10.5, 0.43);
  // 届出の区分: 開業に「1」
  drawText(ctx, "1", 0.373, 0.3386, 12);
  // 所得の種類（□へチェック）
  if (values.incomeTypes.includes("real_estate")) markCheckBox(CHECK_FIELDS.incomeRealEstate);
  if (values.incomeTypes.includes("forest")) markCheckBox(CHECK_FIELDS.incomeForest);
  if (values.incomeTypes.includes("business")) markCheckBox(CHECK_FIELDS.incomeBusiness);
  // 開業・廃業等日（元号・年・月・日）
  if (values.startDate) {
    drawTextFitted(ctx, values.startDate.eraName, 0.582, 0.4778, 9.5, 0.05);
    drawText(ctx, String(values.startDate.eraYear), 0.636, 0.4784, 10);
    drawText(ctx, String(values.startDate.month), 0.673, 0.4781, 10);
    drawText(ctx, String(values.startDate.day), 0.712, 0.4778, 10);
  }
  // 開業・廃業に伴う届出書の提出の有無（□へチェック）
  markCheckBox(
    values.submitsBlueApplication ? CHECK_FIELDS.submitsBlueYes : CHECK_FIELDS.submitsBlueNo,
  );
  markCheckBox(
    values.submitsConsumptionElection
      ? CHECK_FIELDS.submitsConsumptionYes
      : CHECK_FIELDS.submitsConsumptionNo,
  );
  // 事業の概要
  drawMultilineText(ctx, values.businessOverview, 0.216, 0.66, 10.5, 0.0205, 0.725, 4);
  // 給与等の支払の状況
  drawTextFitted(ctx, values.salaryOtherLabel, 0.099, 0.8187, 9, 0.065);
  drawSalaryRow(
    ctx,
    values.salaryFamily,
    0.7665,
    { yes: CHECK_FIELDS.salaryFamilyTaxYes, no: CHECK_FIELDS.salaryFamilyTaxNo },
    markCheckBox,
  );
  drawSalaryRow(
    ctx,
    values.salaryEmployee,
    0.7928,
    { yes: CHECK_FIELDS.salaryEmployeeTaxYes, no: CHECK_FIELDS.salaryEmployeeTaxNo },
    markCheckBox,
  );
  drawSalaryRow(
    ctx,
    values.salaryOther,
    0.8189,
    { yes: CHECK_FIELDS.salaryOtherTaxYes, no: CHECK_FIELDS.salaryOtherTaxNo },
    markCheckBox,
  );
  if (values.salaryTotalCount !== null) {
    drawTextRight(ctx, String(values.salaryTotalCount), 0.212, 0.8441, 10);
  }
  // 源泉所得税の納期の特例の承認に関する申請書の提出の有無
  if (values.withholdingSpecial === true) markCheckBox(CHECK_FIELDS.withholdingSpecialYes);
  if (values.withholdingSpecial === false) markCheckBox(CHECK_FIELDS.withholdingSpecialNo);
  // 給与支払を開始する年月日（元号年で記入）
  if (values.salaryStartDate) {
    drawTextRight(ctx, String(values.salaryStartDate.eraYear), 0.82, 0.8705, 10);
    drawTextRight(ctx, String(values.salaryStartDate.month), 0.872, 0.8705, 10);
    drawTextRight(ctx, String(values.salaryStartDate.day), 0.925, 0.8704, 10);
  }
  // その他参考事項
  drawMultilineText(ctx, values.otherNotes, 0.603, 0.743, 10, 0.0205, 0.338, 6);
}

/**
 * 公式様式 PDF（1ページ）に値を重ねた PDF を返す。
 * templateBytes は loadOpeningNoticeFormTemplate で用意する。
 */
export async function buildOpeningNoticePdf(
  values: OpeningNoticeFormValues,
  templateBytes: Uint8Array,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const first = doc.getPages()[0];
  const { width, height } = first.getSize();
  drawForm(
    { page: first, font, width, height, scale: height / 841.89 },
    values,
    (fieldName) => checkFieldWithVectorAppearance(doc, fieldName),
  );
  return doc.save();
}
