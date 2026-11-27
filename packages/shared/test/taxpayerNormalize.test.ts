import { describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  EMPTY_XTX_TAXPAYER,
  Transaction,
  XtxFilingContext,
  XtxTaxpayer,
  buildConsumptionXtx,
  buildXtxFiling,
  computeConsumptionReturn,
  computeCorrectedFigures,
  computeIncomeTax,
  normalizeNameKana,
  normalizePhoneNumber,
  normalizeXtxTaxpayer,
} from "../src";

const CANONICAL: XtxTaxpayer = {
  name: "テスト太郎",
  nameKana: "テストタロウ",
  zipCode: "7220062",
  address: "広島県尾道市向東町3567-1",
  addressLine2: "",
  birthDate: "1980-04-01",
  phone: "080-2500-7879",
  taxOfficeName: "尾道",
  taxOfficeCode: "08121",
  myNumber: "",
  userId: "1234567890123456",
  occupation: "システムエンジニア",
  shopName: "",
  jan1Address: "",
};

/** 表記ゆれのある入力。正規化後は CANONICAL と一致しなければならない。 */
const MESSY: XtxTaxpayer = {
  ...CANONICAL,
  name: " テスト太郎　",
  nameKana: "てすとたろう",
  zipCode: "722-0062",
  address: "広島県尾道市向東町3567-1 ",
  phone: "08025007879",
  userId: "1234-5678-9012-3456",
};

const INCOME_CONTEXT: XtxFilingContext = {
  submissionDate: "2026-11-20",
  periodFrom: null,
  periodTo: null,
  filingKind: null,
};

const SHOHI_CONTEXT: XtxFilingContext = {
  submissionDate: "2026-11-15",
  periodFrom: "2025-01-01",
  periodTo: "2025-12-31",
  filingKind: 1,
};

describe("normalizeNameKana", () => {
  test("ひらがなを全角カタカナにする", () => {
    expect(normalizeNameKana("おかもとこうへい")).toBe("オカモトコウヘイ");
    expect(normalizeNameKana("がぎぐげご")).toBe("ガギグゲゴ");
  });

  test("半角カタカナを全角カタカナにする（濁点の合成含む）", () => {
    expect(normalizeNameKana("ﾃｽﾄﾀﾛｳ")).toBe("テストタロウ");
    expect(normalizeNameKana("ｶﾞｷﾞｸﾞ")).toBe("ガギグ");
  });

  test("空白は取り除く", () => {
    expect(normalizeNameKana("おかもと こうへい")).toBe("オカモトコウヘイ");
    expect(normalizeNameKana("ｵｶﾓﾄ　ｺｳﾍｲ")).toBe("オカモトコウヘイ");
  });

  test("合成できない濁点が別文字に化けない", () => {
    // セ+゛ は合成形が無い。NFKC で結合濁点（U+3099）になり、そのまま
    // 残るのが正しい（ひらがなの変換範囲に含めると +0x60 で別文字に化ける）
    const out = normalizeNameKana("セ゛");
    expect(out).toBe("セ\u3099");
    expect(out).not.toContain("・");
  });
});

describe("normalizePhoneNumber", () => {
  test("ハイフン区切りはそのまま、数字だけは桁数で3分割する", () => {
    expect(normalizePhoneNumber("080-2500-7879")).toBe("080-2500-7879");
    expect(normalizePhoneNumber("08025007879")).toBe("080-2500-7879");
    expect(normalizePhoneNumber("0848222131")).toBe("0848-22-2131");
    expect(normalizePhoneNumber("0848-22-2131")).toBe("0848-22-2131");
  });

  test("10桁・11桁にできない入力は空文字（検証で不備になる）", () => {
    expect(normalizePhoneNumber("")).toBe("");
    expect(normalizePhoneNumber("080-2500")).toBe("");
    expect(normalizePhoneNumber("12345")).toBe("");
  });

  test("合計桁数が合っても各要素の桁数が不正なら空文字", () => {
    expect(normalizePhoneNumber("080-250-07879")).toBe(""); // 末尾5桁
    expect(normalizePhoneNumber("123-4567-8901")).toBe(""); // 先頭が0始まりでない
    expect(normalizePhoneNumber("080-25007-879")).toBe(""); // 中間5桁・末尾3桁
    expect(normalizePhoneNumber("03-1234-5678")).toBe("03-1234-5678"); // 2-4-4 は正
  });
});

describe("normalizeXtxTaxpayer", () => {
  test("揃ったデータはそのまま通る", () => {
    expect(normalizeXtxTaxpayer(CANONICAL, INCOME_CONTEXT)).toEqual(CANONICAL);
    expect(normalizeXtxTaxpayer(CANONICAL, SHOHI_CONTEXT)).toEqual(CANONICAL);
  });

  test("表記ゆれは正規化され、入力オブジェクトは変更しない", () => {
    const normalized = normalizeXtxTaxpayer(MESSY, INCOME_CONTEXT);
    expect(normalized).toEqual(CANONICAL);
    expect(MESSY.nameKana).toBe("てすとたろう");
    expect(MESSY.zipCode).toBe("722-0062");
  });

  test("氏名・住所の全角空白は半角スペース1つに寄る", () => {
    const normalized = normalizeXtxTaxpayer(
      { ...CANONICAL, name: "テスト　太郎", address: "広島県　尾道市" },
      INCOME_CONTEXT,
    );
    expect(normalized.name).toBe("テスト 太郎");
    expect(normalized.address).toBe("広島県 尾道市");
  });

  const FIELD_CASES: [string, Partial<XtxTaxpayer>, RegExp][] = [
    ["氏名が空", { name: "" }, /氏名/],
    ["氏名が空白だけ", { name: "　" }, /氏名/],
    ["フリガナが空", { nameKana: "" }, /フリガナ/],
    ["フリガナが漢字", { nameKana: "テスト太郎" }, /フリガナ/],
    ["郵便番号が空", { zipCode: "" }, /郵便番号/],
    ["郵便番号が6桁", { zipCode: "722-006" }, /郵便番号/],
    ["住所が空", { address: "" }, /住所/],
    ["電話番号が空", { phone: "" }, /電話番号/],
    ["電話番号が短い", { phone: "080-2500" }, /電話番号/],
    ["税務署名が空", { taxOfficeName: "" }, /税務署名/],
    ["税務署コードが空", { taxOfficeCode: "" }, /税務署コード/],
    ["税務署コードが4桁", { taxOfficeCode: "8121" }, /税務署コード/],
    ["利用者識別番号が空", { userId: "" }, /利用者識別番号/],
    ["利用者識別番号が15桁", { userId: "123456789012345" }, /利用者識別番号/],
    ["個人番号が11桁", { myNumber: "12345678901" }, /個人番号/],
    ["生年月日が実在しない", { birthDate: "1980-02-30" }, /生年月日/],
  ];
  for (const [label, patch, pattern] of FIELD_CASES) {
    test(`不足・不備は項目名を挙げて止まる: ${label}`, () => {
      expect(() =>
        normalizeXtxTaxpayer({ ...CANONICAL, ...patch }, INCOME_CONTEXT),
      ).toThrow(pattern);
    });
  }

  const CONTEXT_CASES: [string, Partial<XtxFilingContext>, RegExp][] = [
    ["提出日がスラッシュ区切り", { submissionDate: "2026/11/15" }, /提出日/],
    ["提出日が実在しない", { submissionDate: "2026-02-30" }, /提出日/],
    ["課税期間開始日が不正", { periodFrom: "2025-13-01" }, /課税期間開始日/],
    ["課税期間終了日が空", { periodTo: "" }, /課税期間終了日/],
    [
      "課税期間の前後が逆",
      { periodFrom: "2025-12-31", periodTo: "2025-01-01" },
      /課税期間/,
    ],
    ["申告区分が対象外", { filingKind: 2 }, /申告区分/],
  ];
  for (const [label, patch, pattern] of CONTEXT_CASES) {
    test(`不足・不備は項目名を挙げて止まる: ${label}`, () => {
      expect(() =>
        normalizeXtxTaxpayer(CANONICAL, { ...SHOHI_CONTEXT, ...patch }),
      ).toThrow(pattern);
    });
  }

  test("複数の不足は1つの例外で全項目挙げる", () => {
    let message = "";
    try {
      normalizeXtxTaxpayer(EMPTY_XTX_TAXPAYER, INCOME_CONTEXT);
    } catch (e) {
      message = e instanceof Error ? e.message : "";
    }
    for (const field of [
      "氏名",
      "フリガナ",
      "郵便番号",
      "住所",
      "電話番号",
      "税務署名",
      "税務署コード",
      "利用者識別番号",
    ]) {
      expect(message).toContain(field);
    }
  });
});

function itSection(xtx: string): string {
  const m = /<IT VR="1\.0" id="IT">[\s\S]*?<\/IT>/.exec(xtx);
  if (!m) throw new Error("IT部が見つからない");
  return m[0];
}

function buildShohi(taxpayer: XtxTaxpayer): string {
  const values = {
    salesIncl10: 0,
    salesIncl8: 0,
    nontaxableSales: 0,
    exemptSales: 0,
    purchasesIncl10: 0,
    purchasesIncl8: 0,
    interimNational: 0,
    interimLocal: 0,
  };
  return buildConsumptionXtx({
    taxpayer,
    periodFrom: "2025-01-01",
    periodTo: "2025-12-31",
    submissionDate: "2026-11-15",
    filingKind: 1,
    basePeriodSalesThousands: 0,
    input: values,
    result: computeConsumptionReturn(values),
    originalNational: null,
    originalLocal: null,
  });
}

function buildIncome(taxpayer: XtxTaxpayer): string {
  const transactions: Transaction[] = [
    {
      date: "2025-06-15",
      year: 2025,
      description: "事業売上",
      amount: 12_000_000,
      account: "普通預金",
      category: "売上高",
      income_type: "business",
      tax_category: "",
    },
  ];
  const figures = computeCorrectedFigures(transactions, 2025);
  const tax = computeIncomeTax({
    year: 2025,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year: 2025,
    amendment: false,
    submissionDate: "2026-11-20",
    taxpayer,
    figures,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    tax,
    categoryTotals: { business: {}, realEstate: {} },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
}

describe("生成ゲート（両手続共通）", () => {
  test("消費税: 表記ゆれのある入力でもIT部は正規化済み入力と同一になる", () => {
    const messy = buildShohi(MESSY);
    expect(itSection(messy)).toBe(itSection(buildShohi(CANONICAL)));
    expect(messy).toContain(
      '<NOZEISHA_NM_KN ID="NOZEISHA_NM_KN">テストタロウ</NOZEISHA_NM_KN>',
    );
    expect(messy).toContain("<gen:zip1>722</gen:zip1><gen:zip2>0062</gen:zip2>");
    expect(messy).toContain(
      "<gen:tel1>080</gen:tel1><gen:tel2>2500</gen:tel2><gen:tel3>7879</gen:tel3>",
    );
  });

  test("所得税: 表記ゆれのある入力でもIT部は正規化済み入力と同一になる", () => {
    expect(itSection(buildIncome(MESSY))).toBe(itSection(buildIncome(CANONICAL)));
  });

  test("消費税: フリガナが欠けたら生成しない", () => {
    expect(() => buildShohi({ ...CANONICAL, nameKana: "" })).toThrow(/フリガナ/);
  });

  test("所得税: 郵便番号が欠けたら生成しない", () => {
    expect(() => buildIncome({ ...CANONICAL, zipCode: "" })).toThrow(/郵便番号/);
  });

  test("消費税: 課税期間の前後が逆なら生成しない", () => {
    const values = {
      salesIncl10: 0,
      salesIncl8: 0,
      nontaxableSales: 0,
      exemptSales: 0,
      purchasesIncl10: 0,
      purchasesIncl8: 0,
      interimNational: 0,
      interimLocal: 0,
    };
    expect(() =>
      buildConsumptionXtx({
        taxpayer: CANONICAL,
        periodFrom: "2025-12-31",
        periodTo: "2025-01-01",
        submissionDate: "2026-11-15",
        filingKind: 1,
        basePeriodSalesThousands: 0,
        input: values,
        result: computeConsumptionReturn(values),
        originalNational: null,
        originalLocal: null,
      }),
    ).toThrow(/課税期間/);
  });
});
