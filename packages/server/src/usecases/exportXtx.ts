/**
 * exportXtx.ts — e-Tax 申告等データ（XTX）出力ユースケース（usecases）。
 * DB不要・ステートレス。数値計算はすべて @etax/shared の決定的な関数が行い、
 * XTXの組み立ては buildXtxFiling に委ねる。生成物は署名なしの組み込み用
 * データで、送信（マイナンバーカード署名）は e-Tax 側で本人が行う。
 * 生成後は公式XSD検証を常時実行し、スキーマ違反なら 400 で止める
 * （検証できない場合は xsd_warning として理由を返す）。
 */
import {
  AgricultureInput,
  AgricultureStatement,
  AgricultureWire,
  BalanceSheetAccount,
  DepreciationDetailRow,
  ExpandedIncomeBreakdown,
  ExpandedIncomeInput,
  ExpandedIncomeWire,
  SeparateTaxationAmounts,
  TaxCreditInputs,
  agricultureFromWire,
  computeAgricultureStatement,
  isAgricultureEmpty,
  normalizeMiscIncomeInput,
  normalizeSalaryIncomeInput,
  Transaction,
  XtxBalanceSheetInput,
  XtxTaxpayer,
  buildXtxFiling,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  computeManualIncomes,
  depreciationDetailRow,
  expandedIncomeFromWire,
  expandedWithholdingTotal,
  filterYear,
  normalizeTransactions,
  resolveTaxCreditInputs,
  statementCategoryTotals,
} from "@etax/shared";

// 決算書の科目別合計は @etax/shared の単一実装を使う。MCP の export_xtx
// ツールがこのモジュールから import しているため、名前は引き続き export する。
export { statementCategoryTotals };
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { XtxXsdInvalidError, xsdWarningOrThrow } from "../services/etax/xsdValidator";
import {
  ExportXtxRequest,
  ExportXtxRequestSchema,
  ExportXtxResponse,
  ExportXtxResponseSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";

export const exportXtxRoute = createRoute({
  method: "post",
  path: "/api/etax/export-xtx",
  operationId: "exportXtx",
  tags: ["Etax"],
  summary: "e-Tax 申告等データ（XTX）の出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportXtxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportXtxResponseSchema } },
      description: "XTXファイル名と内容",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストが不正、または対応外の年分",
    },
  },
});

/** 拡張所得の配線結果（所得税計算・XTX生成への入力）。 */
export interface ExpandedTaxWiring {
  /** 正規化済みの拡張所得入力（XTXビルダーへ渡す。未指定なら undefined） */
  input?: ExpandedIncomeInput;
  /** 拡張所得の計算内訳 */
  breakdown?: ExpandedIncomeBreakdown;
  /** 総合課税分へ加算する所得金額（配当の総合分＋一時の1/2算入額） */
  comprehensiveAddition: number;
  /** 配当控除の対象額を解決済みの税額控除入力 */
  taxCredits: TaxCreditInputs;
  /** 申告分離課税の所得（拡張所得がない場合は undefined） */
  separateTaxation?: SeparateTaxationAmounts;
  /** 拡張所得分の源泉徴収税額（申告する配当＋株式等譲渡分） */
  withholdingAddition: number;
}

/**
 * 拡張所得入力（ワイヤ形式）を所得税計算・XTX生成で使う形に解決する。
 * exportXtx / exportReturnPdf / MCP の export_xtx で共用する単一の配線。
 * 配当の入力がある場合、配当控除の対象額は配当所得の内訳から導出した額が
 * 優先し、手入力との二重適用を防ぐ。
 */
export function resolveExpandedTax(
  wire: ExpandedIncomeWire | undefined,
  taxCredits: TaxCreditInputs,
): ExpandedTaxWiring {
  if (!wire) {
    return { comprehensiveAddition: 0, taxCredits, withholdingAddition: 0 };
  }
  const input = expandedIncomeFromWire(wire);
  const breakdown = computeExpandedIncomes(input);
  return {
    input,
    breakdown,
    comprehensiveAddition: breakdown.comprehensiveAddition,
    taxCredits: resolveTaxCreditInputs(taxCredits, breakdown),
    separateTaxation: {
      stockIncome: breakdown.separateStockIncome,
      dividendIncome: breakdown.separateDividendIncome,
    },
    withholdingAddition: expandedWithholdingTotal(breakdown),
  };
}

/** 農業所得の配線（入力と計算済みの決算書内訳）。 */
export interface AgricultureWiring {
  /** 正規化済みの農業所得入力（空の場合は undefined） */
  input?: AgricultureInput;
  /** 決算書の計算内訳（XTX ビルダーへ渡す） */
  statement?: AgricultureStatement;
}

/**
 * 農業所得入力（ワイヤ形式）を計算・XTX生成で使う形に解決する。
 * exportXtx / exportReturnPdf / MCP の export_xtx で共用する単一の配線。
 * 農業所得は帳簿の取引とは混ぜず、申告入力として独立に扱う。
 */
export function resolveAgriculture(
  wire: AgricultureWire | undefined,
): AgricultureWiring {
  if (!wire) return {};
  const input = agricultureFromWire(wire);
  if (isAgricultureEmpty(input)) return {};
  return { input, statement: computeAgricultureStatement(input) };
}

/** リクエストの固定資産入力から減価償却明細行（事業・不動産・農業別）を組み立てる。 */
function depreciationFromWire(
  body: ExportXtxRequest,
): {
  business: DepreciationDetailRow[];
  realEstate: DepreciationDetailRow[];
  agriculture: DepreciationDetailRow[];
} | undefined {
  if (!body.fixed_assets || body.fixed_assets.length === 0) return undefined;
  const business: DepreciationDetailRow[] = [];
  const realEstate: DepreciationDetailRow[] = [];
  const agriculture: DepreciationDetailRow[] = [];
  for (const asset of body.fixed_assets) {
    // 償却計算が投げる例外を未捕捉の 500 にせず、対象資産が分かる
    // 400 として返す（Issue #11）。
    let row: DepreciationDetailRow | null;
    try {
      row = depreciationDetailRow(
        asset.name,
        {
          acquisitionDate: asset.acquisition_date,
          serviceStartDate: asset.service_start_date,
          cost: asset.cost,
          usefulLifeYears: asset.useful_life_years,
          method: asset.method,
          businessRatioPercent: asset.business_ratio_percent,
        },
        body.year,
        asset.quantity ?? "",
      );
    } catch (e) {
      throw new HTTPException(400, {
        message: `固定資産「${asset.name}」の減価償却計算に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    if (!row) continue;
    if (asset.income_type === "real_estate") realEstate.push(row);
    else if (asset.income_type === "agriculture") agriculture.push(row);
    else business.push(row);
  }
  return { business, realEstate, agriculture };
}

/** リクエストの貸借対照表入力を XTX ビルダーの形式へ変換する。試算表からも使う。 */
export function balanceSheetFromWire(
  body: Pick<ExportXtxRequest, "balance_sheet">,
): XtxBalanceSheetInput | undefined {
  const bs = body.balance_sheet;
  if (!bs) return undefined;
  return {
    opening: bs.opening as Partial<Record<BalanceSheetAccount, number>>,
    closing: bs.closing as Partial<Record<BalanceSheetAccount, number>>,
    extraAsset: bs.extra_asset
      ? { name: bs.extra_asset.name, opening: bs.extra_asset.opening, closing: bs.extra_asset.closing }
      : undefined,
    extraLiability1: bs.extra_liability1
      ? { name: bs.extra_liability1.name, opening: bs.extra_liability1.opening, closing: bs.extra_liability1.closing }
      : undefined,
    extraLiability2: bs.extra_liability2
      ? { name: bs.extra_liability2.name, opening: bs.extra_liability2.opening, closing: bs.extra_liability2.closing }
      : undefined,
    ownerLoan: bs.owner_loan,
    ownerBorrowing: bs.owner_borrowing,
  };
}

/** ワイヤ形式の納税者情報を XTX ビルダーの形式へ変換する。MCP からも使う。 */
export function toTaxpayer(t: ExportXtxRequest["taxpayer"]): XtxTaxpayer {
  return {
    name: t.name,
    nameKana: t.name_kana,
    zipCode: t.zip_code,
    address: t.address,
    addressLine2: t.address_line2,
    birthDate: t.birth_date,
    phone: t.phone,
    taxOfficeName: t.tax_office_name,
    taxOfficeCode: t.tax_office_code,
    myNumber: t.my_number,
    userId: t.user_id,
    occupation: t.occupation,
    shopName: t.shop_name,
    jan1Address: t.jan1_address,
  };
}

export const exportXtxHandler: RouteHandler<typeof exportXtxRoute> = async (c) => {
  const body = c.req.valid("json");
  const transactions = filterYear(normalizeTransactions(body.transactions ?? []), body.year);
  const agriculture = resolveAgriculture(body.agriculture);
  const figures = computeCorrectedFigures(transactions, body.year, {
    filingType: body.filing_type,
    realEstateBusinessScale: body.real_estate_business_scale,
    agriculture: agriculture.input,
  });
  const depreciation = depreciationFromWire(body);
  const balanceSheet = balanceSheetFromWire(body);
  const miscIncome = normalizeMiscIncomeInput(body.misc_income);
  const salaryIncome = normalizeSalaryIncomeInput(body.salary_income);
  const manual = computeManualIncomes(
    body.year,
    salaryIncome,
    miscIncome,
    figures._detail.business_income +
      figures._detail.real_estate_income +
      figures._detail.agriculture_income,
  );
  const expandedTax = resolveExpandedTax(body.expanded_income, body.tax_credits);
  const tax = computeIncomeTax({
    year: body.year,
    totalIncome:
      figures._detail.business_income +
      figures._detail.real_estate_income +
      figures._detail.agriculture_income +
      manual.total +
      expandedTax.comprehensiveAddition,
    deductions: body.deductions,
    taxCredits: expandedTax.taxCredits,
    separateTaxation: expandedTax.separateTaxation,
  });
  let xtx: string;
  try {
    xtx = buildXtxFiling({
      year: body.year,
      amendment: body.amendment,
      submissionDate: body.submission_date,
      taxpayer: toTaxpayer(body.taxpayer),
      figures,
      filingType: body.filing_type,
      depreciation,
      balanceSheet,
      deductionInputs: body.deductions,
      miscIncome,
      salaryIncome,
      expandedIncome: expandedTax.input,
      agriculture: agriculture.statement
        ? {
            statement: agriculture.statement,
            blueDeduction: figures._detail.blue_deduction_agriculture,
          }
        : undefined,
      tax,
      categoryTotals: {
        business: statementCategoryTotals(transactions, "business"),
        realEstate: statementCategoryTotals(transactions, "real_estate"),
      },
      withholdingTax: body.withholding_tax + expandedTax.withholdingAddition,
      prepaidTax: body.prepaid_tax,
      originalThirdPeriodTax: body.original_third_period_tax,
    });
  } catch (e) {
    throw new HTTPException(400, {
      message: e instanceof Error ? e.message : "XTXの生成に失敗しました",
    });
  }
  // 公式XSD検証は常時実行する。スキーマ違反なら生成を止め、検証自体が
  // できない場合（未同梱・エンジン不在）は警告を応答に含めて続行する。
  let xsdWarning: string | null;
  try {
    xsdWarning = xsdWarningOrThrow(xtx);
  } catch (e) {
    if (e instanceof XtxXsdInvalidError) {
      throw new HTTPException(400, { message: e.message });
    }
    throw e;
  }
  const response: ExportXtxResponse = {
    filename: `etax-shotoku-${body.year}${body.amendment ? "-shusei" : "-kakutei"}.xtx`,
    xtx,
    xsd_warning: xsdWarning,
  };
  return c.json(response, 200);
};
