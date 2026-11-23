import { describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  Transaction,
  buildXtxFiling,
  computeCorrectedFigures,
  computeIncomeTax,
  xtxSupportedYears,
} from "../src";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    date: "2023-06-15",
    year: 2023,
    description: "テスト",
    amount: 0,
    account: "普通預金",
    category: "未分類",
    income_type: "business",
    tax_category: "",
    ...partial,
  };
}

const TRANSACTIONS: Transaction[] = [
  tx({ description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
  tx({ description: "家賃収入", amount: 1_764_000, category: "家賃収入", income_type: "real_estate" }),
  tx({ description: "通信費", amount: -1_200_000, category: "通信費", income_type: "business" }),
  tx({ description: "消耗品費", amount: -900_000, category: "消耗品費", income_type: "business" }),
  tx({ description: "固定資産税", amount: -300_000, category: "租税公課", income_type: "real_estate" }),
  tx({ description: "管理費", amount: -170_000, category: "管理費", income_type: "real_estate" }),
];

function buildSample(amendment: boolean, filingType?: "blue65" | "white") {
  const figures = computeCorrectedFigures(TRANSACTIONS, 2023, { filingType });
  const tax = computeIncomeTax({
    year: 2023,
    totalIncome:
      figures._detail.business_income + figures._detail.real_estate_income,
    deductions: {
      ...EMPTY_DEDUCTION_INPUTS,
      socialInsurancePaid: 1_200_000,
      lifeInsurance: {
        newGeneral: 120_000,
        newCareMedical: 0,
        newPension: 0,
        oldGeneral: 0,
        oldPension: 0,
      },
    },
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year: 2023,
    amendment,
    submissionDate: "2026-11-20",
    taxpayer: {
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
    },
    figures,
    filingType,
    miscIncome: EMPTY_MISC_INCOME,
    deductionInputs: {
      ...EMPTY_DEDUCTION_INPUTS,
      socialInsurancePaid: 1_200_000,
      lifeInsurance: {
        newGeneral: 120_000,
        newCareMedical: 0,
        newPension: 0,
        oldGeneral: 0,
        oldPension: 0,
      },
    },
    tax,
    categoryTotals: {
      business: { 通信費: 1_200_000, 消耗品費: 900_000 },
      realEstate: { 家賃収入: 1_764_000, 租税公課: 300_000, 管理費: 170_000 },
    },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: amendment ? 1_480_000 : null,
  });
}

describe("buildXtxFiling の減価償却明細と貸借対照表", () => {
  test("減価償却明細が KOA210-3 に出て、貸借対照表が貸借一致で KOA210-4 に出る", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: { ...EMPTY_DEDUCTION_INPUTS },
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const depreciation = {
      business: [
        {
          name: "パソコン",
          quantity: "1台",
          acquisitionYearMonth: "2023-04",
          cost: 600_000,
          guaranteeAmount: null,
          basisAmount: 600_000,
          method: "straight_line" as const,
          methodLabel: "定額法",
          usefulLifeYears: 4,
          rate: 0.25,
          months: 9,
          ordinary: 112_500,
          total: 112_500,
          businessRatioPercent: 100,
          deductible: 112_500,
          closingBookValue: 487_500,
        },
      ],
      realEstate: [],
    };
    // 期首: 現金 1,000,000 = 元入金 1,000,000。期末は所得（控除前）を加えた元入金と一致させる
    const incomeBeforeBlue = figures._detail.business_income_before_deduction;
    const xtx = buildXtxFiling({
      year: 2023,
      amendment: false,
      submissionDate: "2024-03-10",
      taxpayer: {
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
      },
      figures,
      deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
      depreciation,
      balanceSheet: {
        opening: { cash: 1_000_000, capital: 1_000_000 },
        closing: { cash: 1_000_000 + incomeBeforeBlue },
        ownerLoan: 0,
        ownerBorrowing: 0,
      },
    });
    expect(xtx).toContain("<KOA210-3");
    expect(xtx).toContain("<AMF01610>パソコン</AMF01610>");
    expect(xtx).toContain("<AMF01730>112500</AMF01730>");
    expect(xtx).toContain("<KOA210-4");
    expect(xtx).toContain("<AMG00230>1000000</AMG00230>");
    expect(xtx).toContain(`<AMG00740>${1_000_000 + incomeBeforeBlue}</AMG00740>`);
  });

  test("貸借が一致しない貸借対照表は例外にする", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: { ...EMPTY_DEDUCTION_INPUTS },
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    expect(() =>
      buildXtxFiling({
        year: 2023,
        amendment: false,
        submissionDate: "2024-03-10",
        taxpayer: {
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
        },
        figures,
        deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
        balanceSheet: {
          opening: { cash: 500_000, capital: 1_000_000 },
          closing: { cash: 0 },
          ownerLoan: 0,
          ownerBorrowing: 0,
        },
      }),
    ).toThrow();
  });
});

describe("buildXtxFiling", () => {
  test("対応年分は 2023〜2026", () => {
    expect(xtxSupportedYears()).toEqual([2023, 2024, 2025, 2026]);
  });

  test("修正申告のXTXに手続・様式バージョンと主要金額が入る", () => {
    const xtx = buildSample(true);
    expect(xtx).toContain('<RKO0010 VR="23.1.1"');
    expect(xtx).toContain('<KOA020 VR="21.0"');
    expect(xtx).toContain('<KOA210 VR="11.0"');
    expect(xtx).toContain('<KOA220 VR="8.0"');
    // 収入金額等: 事業 12,000,000 / 不動産 1,764,000
    expect(xtx).toContain("<ABB00030>12000000</ABB00030>");
    expect(xtx).toContain("<ABB00050>1764000</ABB00050>");
    // 青色申告特別控除の合計 750,000
    expect(xtx).toContain("<ABB00800>750000</ABB00800>");
    // 修正申告欄: 修正前の第3期分の税額
    expect(xtx).toContain("<ABB00765>1480000</ABB00765>");
    // 決算書: 売上・賃貸料
    expect(xtx).toContain("<AMF00100>12000000</AMF00100>");
    expect(xtx).toContain("<ANF00080>1764000</ANF00080>");
    // IT部: 申告区分=修正(2)
    expect(xtx).toContain('<SHINKOKU_KBN ID="SHINKOKU_KBN"><kubun_CD>2</kubun_CD></SHINKOKU_KBN>');
    // 申告納税額と増加額は100円未満切捨て（国税通則法119条）
    const declared = Number(/<ABB00720>(\d+)<\/ABB00720>/.exec(xtx)?.[1]);
    const increase = Number(/<ABB00767>(\d+)<\/ABB00767>/.exec(xtx)?.[1]);
    expect(declared % 100).toBe(0);
    expect(increase % 100).toBe(0);
    // このサンプルは税額が減る修正なので増加額は0にクランプされる
    expect(increase).toBe(Math.max(declared - 1_480_000, 0));
  });

  test("確定申告では修正申告欄を出さない", () => {
    const xtx = buildSample(false);
    expect(xtx).not.toContain("ABB00763");
    expect(xtx).toContain('<SHINKOKU_KBN ID="SHINKOKU_KBN"><kubun_CD>1</kubun_CD></SHINKOKU_KBN>');
  });

  test("医療費控除の区分（ABB00435）は単純型として内容に直接書く", () => {
    const transactions: Transaction[] = [
      tx({ date: "2025-06-15", year: 2025, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2025);
    const deductions = { ...EMPTY_DEDUCTION_INPUTS, medicalExpensesPaid: 528_000 };
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: true,
      submissionDate: "2026-11-20",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: deductions,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: 1_000_000,
    });
    expect(xtx).toContain("<ABB00435>1</ABB00435>");
    expect(xtx).not.toContain("<ABB00435><kubun_CD>");
    expect(xtx).toContain("<ABB00440>428000</ABB00440>");
  });

  test("白色申告では決算書の代わりに収支内訳書（KOA110/KOA130）が入る", () => {    const white = buildSample(false, "white");
    expect(white).toContain("<KOA110 ");
    expect(white).toContain("<KOA130 ");
    expect(white).not.toContain("<KOA210 ");
    expect(white).not.toContain("<KOA220 ");
    expect(white).toContain("<AIG00030>"); // 収支内訳書（一般用）の売上
    expect(white).toContain("<AKG00030>"); // 収支内訳書（不動産用）の賃貸料
    const blue = buildSample(false);
    expect(blue).toContain("<KOA210 ");
    expect(blue).toContain("<KOA220 ");
    expect(blue).not.toContain("<KOA110 ");
    expect(blue).not.toContain("<KOA130 ");
  });

  test("対応外の年分は例外", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2027,
      totalIncome: 0,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(() =>
      buildXtxFiling({
        year: 2027,
        amendment: false,
        submissionDate: "2028-02-01",
        taxpayer: {
          name: "",
          nameKana: "",
          zipCode: "",
          address: "",
          addressLine2: "",
          birthDate: "",
          phone: "",
          taxOfficeName: "",
          taxOfficeCode: "",
          myNumber: "",
          userId: "",
          occupation: "",
          shopName: "",
          jan1Address: "",
        },
        figures,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
      }),
    ).toThrow();
  });

  test("雑所得（その他）は収入金額ク・所得⑨・計⑩に出て、合計⑫に含まれる", () => {
    const transactions: Transaction[] = [
      tx({ date: "2025-06-15", year: 2025, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2025);
    const miscIncome = { revenue: 175_122, income: 175_122, kubun: 2 };
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome:
        figures._detail.business_income + figures._detail.real_estate_income + miscIncome.income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: true,
      submissionDate: "2026-11-20",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: 1_000_000,
    });
    // 収入金額等: 雑（その他）区分2・金額
    expect(xtx).toContain("<ABB00107>2</ABB00107>");
    expect(xtx).toContain("<ABB00110>175122</ABB00110>");
    // 所得金額等: ⑨その他・⑩計
    expect(xtx).toContain("<ABB01120>175122</ABB01120>");
    expect(xtx).toContain("<ABB01130>175122</ABB01130>");
    // 合計⑫ = 事業所得（12,000,000 − 青色650,000）+ 雑 175,122
    expect(xtx).toContain("<ABB00410>11525122</ABB00410>");
  });
});

/** 年分だけ変えた最小の申告データ（バージョン・構造の確認用）。 */
function buildMinimal(year: number) {
  const transactions: Transaction[] = [
    tx({ date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const tax = computeIncomeTax({
    year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-11-20",
    taxpayer: {
      name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
      address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
      phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
      myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア",
      shopName: "", jan1Address: "",
    },
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

describe("buildXtxFiling の仕様適合（公式XMLスキーマ準拠）", () => {
  test("手続バージョンは手続内帳票対応表の組（様式より2世代先）", () => {
    expect(buildMinimal(2023)).toContain('<RKO0010 VR="23.1.1"');
    expect(buildMinimal(2023)).toContain('<KOA020 VR="21.0"');
    expect(buildMinimal(2024)).toContain('<RKO0010 VR="24.0.1"');
    expect(buildMinimal(2024)).toContain('<KOA020 VR="22.0"');
    expect(buildMinimal(2025)).toContain('<RKO0010 VR="25.0.1"');
    expect(buildMinimal(2025)).toContain('<KOA020 VR="23.0"');
    expect(buildMinimal(2026)).toContain('<RKO0010 VR="26.0.1"');
    expect(buildMinimal(2026)).toContain('<KOA020 VR="24.0"');
    expect(buildMinimal(2026)).toContain('<KOA210 VR="12.0"');
  });

  test("2026年分の決算書バージョンは KOA210=12.0 / KOA220=9.0（令和9年1月受付開始の帳票一覧）", () => {
    const transactions: Transaction[] = [
      tx({ date: "2026-06-15", year: 2026, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
      tx({ date: "2026-06-15", year: 2026, description: "家賃収入", amount: 1_764_000, category: "家賃収入", income_type: "real_estate" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2026);
    const tax = computeIncomeTax({
      year: 2026,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2026,
      amendment: false,
      submissionDate: "2027-02-01",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア",
        shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: { 家賃収入: 1_764_000 } },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    expect(xtx).toContain('<KOA210 VR="12.0"');
    expect(xtx).toContain('<KOA220 VR="9.0"');
  });

  test("DATA・RKO0010 のデフォルト名前空間は shotoku", () => {
    const xtx = buildMinimal(2023);
    expect(xtx).toContain('<DATA id="DATA" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku">');
    expect(xtx).toContain('xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku" xmlns:gen=');
    expect(xtx).not.toContain("XSD/kyotsu");
  });

  test("IT部は ITdefinition.xsd のシーケンス順で必須要素を含む", () => {
    const xtx = buildSample(true);
    const order = [
      "ZEIMUSHO", "TEISYUTSU_DAY", "NOZEISHA_ID", "NOZEISHA_NM_KN", "NOZEISHA_NM",
      "NOZEISHA_ZIP", "NOZEISHA_ADR", "NOZEISHA_TEL", "BIRTHDAY", "SHOKUGYO",
      "TETSUZUKI", "NENBUN", "SHINKOKU_KBN",
    ];
    const positions = order.map((tag) => xtx.indexOf(`<${tag} ID=`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(xtx).toContain('<NOZEISHA_ID ID="NOZEISHA_ID">1234567890123456</NOZEISHA_ID>');
    expect(xtx).toContain('<TETSUZUKI ID="TETSUZUKI"><procedure_CD>RKO0010</procedure_CD></TETSUZUKI>');
    // ZEIMUSHO の子要素名は XSD 定義どおり先頭小文字
    expect(xtx).toContain("<gen:zeimusho_CD>08121</gen:zeimusho_CD>");
    expect(xtx).toContain("<gen:zeimusho_NM>尾道</gen:zeimusho_NM>");
    expect(xtx).not.toContain("<gen:ZEIMUSHO_CD>");
    expect(xtx).not.toContain("<gen:ZEIMUSHO_NM>");
  });

  test("CATALOG の FORM_SEC に様式IDを列挙する", () => {
    const xtx = buildSample(true);
    expect(xtx).toContain("<rdf:li>KOA020</rdf:li>");
    expect(xtx).toContain("<rdf:li>KOA210</rdf:li>");
    expect(xtx).toContain("<rdf:li>KOA220</rdf:li>");
  });

  test("利用者識別番号が無ければ例外（IT部の必須要素）", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: 0,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(() =>
      buildXtxFiling({
        year: 2023,
        amendment: false,
        submissionDate: "2026-11-20",
        taxpayer: {
          name: "テスト太郎", nameKana: "", zipCode: "", address: "広島県尾道市向東町3567-1",
          addressLine2: "", birthDate: "", phone: "", taxOfficeName: "尾道",
          taxOfficeCode: "08121", myNumber: "", userId: "", occupation: "",
          shopName: "", jan1Address: "",
        },
        figures,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
      }),
    ).toThrow(/利用者識別番号/);
  });
});
