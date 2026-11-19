import { describe, expect, test } from "bun:test";
import {
  Transaction,
  summarizeConsumptionTax,
  ConsumptionReturnInput,
  buildConsumptionXtx,
  computeConsumptionReturn,
} from "../src";

const TAXPAYER = {
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

function input(partial: Partial<ConsumptionReturnInput> = {}): ConsumptionReturnInput {
  return {
    salesIncl10: 0,
    salesIncl8: 0,
    nontaxableSales: 0,
    exemptSales: 0,
    purchasesIncl10: 0,
    purchasesIncl8: 0,
    interimNational: 0,
    interimLocal: 0,
    ...partial,
  };
}

describe("computeConsumptionReturn", () => {
  test("課税売上割合100%なら全額控除し、国税・地方税を申告書の丸めで計算する", () => {
    const result = computeConsumptionReturn(
      input({ salesIncl10: 15_352_564, purchasesIncl10: 4_496_249 }),
    );
    expect(result.salesExcl).toBe(13_956_876);
    expect(result.ratio).toBe(100);
    expect(result.fullDeduction).toBe(true);
    expect(result.taxBase).toBe(13_956_000);
    expect(result.outputTax).toBe(1_088_568);
    expect(result.inputTax).toBe(408_749);
    expect(result.diffRaw).toBe(679_819);
    expect(result.payableNational).toBe(679_800);
    expect(result.localTaxGross).toBe(191_700);
    expect(result.payableLocal).toBe(191_700);
    expect(result.totalPayable).toBe(871_500);
  });

  test("課税売上割合95%未満なら一括比例配分する", () => {
    const result = computeConsumptionReturn(
      input({
        salesIncl10: 1_100_000,
        nontaxableSales: 100_000,
        purchasesIncl10: 110_000,
      }),
    );
    expect(result.ratio).toBe(90.9);
    expect(result.fullDeduction).toBe(false);
    expect(result.inputTaxRaw10).toBe(10_000);
    expect(result.inputTax).toBe(9_090);
    expect(result.payableNational).toBe(68_900);
    expect(result.localTaxGross).toBe(19_400);
  });
});

describe("buildConsumptionXtx", () => {
  test("RSH0010にSHA010・SHB017・SHB033と主要金額が入る", () => {
    const values = input({ salesIncl10: 15_352_564, purchasesIncl10: 4_496_249 });
    const xtx = buildConsumptionXtx({
      taxpayer: TAXPAYER,
      periodFrom: "2025-01-01",
      periodTo: "2025-12-31",
      submissionDate: "2026-11-15",
      filingKind: 1,
      basePeriodSalesThousands: 11_345,
      input: values,
      result: computeConsumptionReturn(values),
      originalNational: null,
      originalLocal: null,
    });
    expect(xtx).toContain('<RSH0010 VR="26.0.0"');
    expect(xtx).toContain('<SHA010 VR="10.0"');
    expect(xtx).toContain('<SHB017 VR="2.0"');
    expect(xtx).toContain('<SHB033 VR="2.0"');
    expect(xtx).toContain("<AAJ00120>679800</AAJ00120>");
    expect(xtx).toContain("<AAK00060>191700</AAK00060>");
    expect(xtx).toContain("<AAK00130>871500</AAK00130>");
    expect(xtx).toContain("<DTD00000>100</DTD00000>");
    expect(xtx).toContain("<AAM00020><kubun_CD>3</kubun_CD></AAM00020>");
    expect(xtx).toContain("<DTF00030>408749</DTF00030>");
  });

  test("一括比例配分では付表2にDTGを出す", () => {
    const values = input({
      salesIncl10: 1_100_000,
      nontaxableSales: 100_000,
      purchasesIncl10: 110_000,
    });
    const xtx = buildConsumptionXtx({
      taxpayer: TAXPAYER,
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
    expect(xtx).toContain("<AAM00020><kubun_CD>2</kubun_CD></AAM00020>");
    expect(xtx).toContain("<DTG00170>9090</DTG00170>");
    expect(xtx).not.toContain("<DTF00000>");
  });

  test("仕様適合: 名前空間・IT部の並び順と必須要素・FORM_SEC", () => {
    const values = input({ salesIncl10: 15_352_564, purchasesIncl10: 4_496_249 });
    const xtx = buildConsumptionXtx({
      taxpayer: TAXPAYER,
      periodFrom: "2025-01-01",
      periodTo: "2025-12-31",
      submissionDate: "2026-11-15",
      filingKind: 1,
      basePeriodSalesThousands: 11_345,
      input: values,
      result: computeConsumptionReturn(values),
      originalNational: null,
      originalLocal: null,
    });
    expect(xtx).toContain('<DATA id="DATA" xmlns="http://xml.e-tax.nta.go.jp/XSD/shohi">');
    const order = [
      "ZEIMUSHO", "TEISYUTSU_DAY", "NOZEISHA_ID", "NOZEISHA_NM_KN", "NOZEISHA_NM",
      "NOZEISHA_ZIP", "NOZEISHA_ADR", "NOZEISHA_TEL",
      "TETSUZUKI", "KAZEI_KIKAN_FROM", "KAZEI_KIKAN_TO", "SHINKOKU_KBN",
    ];
    const positions = order.map((tag) => xtx.indexOf(`<${tag} ID=`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(xtx).toContain('<NOZEISHA_ID ID="NOZEISHA_ID">1234567890123456</NOZEISHA_ID>');
    expect(xtx).toContain('<TETSUZUKI ID="TETSUZUKI"><procedure_CD>RSH0010</procedure_CD></TETSUZUKI>');
    expect(xtx).toContain("<gen:zeimusho_CD>08121</gen:zeimusho_CD>");
    expect(xtx).not.toContain("<gen:ZEIMUSHO_CD>");
    expect(xtx).toContain("<rdf:li>SHA010</rdf:li>");
    expect(xtx).toContain("<rdf:li>SHB017</rdf:li>");
    expect(xtx).toContain("<rdf:li>SHB033</rdf:li>");
  });
});

describe("summarizeConsumptionTax", () => {
  const tx = (partial: Partial<Transaction>): Transaction => ({
    date: "2025-06-01",
    year: 2025,
    description: "",
    amount: 0,
    account: "",
    category: "売上高",
    income_type: "business",
    tax_category: "",
    ...partial,
  });

  test("税区分ごとに集計し、仕入は正の税込額になる", () => {
    const summary = summarizeConsumptionTax(
      [
        tx({ amount: 110_000, tax_category: "課税売上10%" }),
        tx({ amount: 108_000, tax_category: "課税売上8%" }),
        tx({ amount: 147_000, tax_category: "非課売上", income_type: "real_estate" }),
        tx({ amount: 50_000, tax_category: "免税売上" }),
        tx({ amount: -55_000, tax_category: "課対仕入10%" }),
        tx({ amount: -54_000, tax_category: "課対仕入8%" }),
        tx({ amount: -10_000, tax_category: "対象外" }),
        tx({ amount: 999, tax_category: "" }),
        tx({ amount: 777, tax_category: "不明な区分" }),
        tx({ amount: 555, tax_category: "課税売上10%", year: 2024, date: "2024-06-01" }),
        // 符号が合わない付け間違いは集計から外れる
        tx({ amount: -3_000, tax_category: "課税売上10%" }),
        tx({ amount: 4_000, tax_category: "課対仕入10%" }),
      ],
      2025,
    );
    expect(summary.salesIncl10).toBe(110_000);
    expect(summary.salesIncl8).toBe(108_000);
    expect(summary.nontaxableSales).toBe(147_000);
    expect(summary.exemptSales).toBe(50_000);
    expect(summary.purchasesIncl10).toBe(55_000);
    expect(summary.purchasesIncl8).toBe(54_000);
    expect(summary.unsetCount).toBe(2);
    expect(summary.unsetAmount).toBe(999 + 777);
    expect(summary.excludedCount).toBe(2);
    expect(summary.excludedAmount).toBe(-3_000 + 4_000);
  });
});
