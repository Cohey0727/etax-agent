/**
 * mcpCalcTools.ts — MCP の集計・税額計算・修正申告の差分・税務知識ベース検索の
 * ツール（services/mcp）。
 *
 * 帳簿DBの取引を対象年で取り出し、@etax/shared の決定的な関数で集計・計算する
 * （LLM に計算させない）。修正申告の差分は渡された申告済み・修正後の JSON 同士を
 * 比べる。
 */
import {
  IncomeTaxFilingInput,
  Transaction,
  XtxTaxpayer,
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  categoryTotals,
  computeIncomeTaxFiling,
  consumptionTax,
  estimateInputTax,
  residentialRentTotal,
  taxableSalesFromBreakdown,
} from "@etax/shared";
import { Db } from "../../lib/db";
import { IncomeTaxReturnRequest, toTaxpayer } from "../etax/xtxInputs";
import { searchTaxKnowledge } from "../knowledge/searchTaxKnowledge";
import { savedTaxpayerProfile } from "./mcpBusinessStartTools";
import {
  McpToolModule,
  agricultureArg,
  expandedIncomeArg,
  filingOptionsArg,
  filingTypeProperty,
  ledgerTransactions,
  mergeDeductionInputs,
  mergeTaxCreditInputs,
  miscIncomeArg,
  realEstateScaleProperty,
  requireDb,
  salaryIncomeArg,
  taxpayerArg,
  textResult,
  todayInTokyo,
  yearArg,
  yearProperty,
} from "./mcpToolKit";

/**
 * MCP の引数と帳簿の取引から所得税の計算の入力を作る。income_tax・export_xtx・
 * export_return_pdf が同じ入力で shared の computeIncomeTaxFiling を使う。
 */
export function incomeTaxFilingFromArgs(
  args: Record<string, unknown>,
  year: number,
  transactions: Transaction[],
): IncomeTaxFilingInput {
  const options = filingOptionsArg(args);
  return {
    year,
    transactions,
    filingType: options.filingType,
    realEstateBusinessScale: options.realEstateBusinessScale,
    agriculture: agricultureArg(args),
    salaryIncome: salaryIncomeArg(args),
    miscIncome: miscIncomeArg(args),
    expandedIncome: expandedIncomeArg(args),
    deductions: mergeDeductionInputs(args["deductions"]),
    taxCredits: mergeTaxCreditInputs(args["tax_credits"]),
  };
}

/** taxpayer 引数の納税者情報。省略時は対象年の保存済みプロフィールを使う。 */
export async function taxpayerForYear(
  db: Db,
  args: Record<string, unknown>,
  year: number,
): Promise<XtxTaxpayer> {
  return toTaxpayer(
    taxpayerArg(args["taxpayer"] !== undefined ? args["taxpayer"] : await savedTaxpayerProfile(db, year)),
  );
}

/** 申告書（XTX・紙イメージ PDF）の出力の入力を、帳簿DBの取引と引数から作る。 */
export async function incomeTaxReturnFromArgs(
  db: Db,
  args: Record<string, unknown>,
): Promise<IncomeTaxReturnRequest> {
  const year = yearArg(args);
  const number = (key: string): number => (typeof args[key] === "number" ? (args[key] as number) : 0);
  return {
    filing: incomeTaxFilingFromArgs(args, year, await ledgerTransactions(db, year)),
    amendment: args["amendment"] === true,
    submissionDate: typeof args["submission_date"] === "string" ? args["submission_date"] : todayInTokyo(),
    taxpayer: await taxpayerForYear(db, args, year),
    withholdingTax: number("withholding_tax"),
    prepaidTax: number("prepaid_tax"),
    originalThirdPeriodTax:
      typeof args["original_third_period_tax"] === "number" ? args["original_third_period_tax"] : null,
  };
}

export const mcpCalcTools: McpToolModule = {
  tools: [
    {
      name: "aggregate_year",
      description:
        "帳簿DBの指定年の取引を集計し、事業所得・不動産所得と青色申告特別控除を返す。控除は申告の種類（filing_type、既定は青色65万円）と不動産の規模で変わる。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          filing_type: filingTypeProperty,
          real_estate_business_scale: realEstateScaleProperty,
        },
        required: ["year"],
      },
    },
    {
      name: "consumption_tax",
      description:
        "帳簿DBの指定年の消費税を、本則（standard）・簡易課税（simplified）・2割特例（special20）の3方式すべて計算して返す。家賃収入は非課税として扱う。",
      inputSchema: { type: "object", properties: { year: yearProperty }, required: ["year"] },
    },
    {
      name: "income_tax",
      description:
        "帳簿DBの指定年の集計をもとに、所得控除・税額控除を入れて所得税額（復興特別所得税込み・確定税額）を計算する。deductions / tax_credits は未指定の項目はゼロとして扱う。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          deductions: { type: "object", description: "所得控除の入力（DeductionInputs、camelCase）" },
          tax_credits: { type: "object", description: "税額控除の入力（TaxCreditInputs、camelCase）" },
          expanded_income: {
            type: "object",
            description:
              "配当・一時・株式等譲渡の入力（任意、camelCase）: temp{revenue,expenses}、dividend{listedRevenue,listedTrustRevenue,listedWithholding,listedMode(comprehensive/separate/none),generalRevenue,generalTrustRevenue,generalWithholding,interestExpense}、stocks{general/listed{revenue,otherRevenue,acquisitionCost,transferFees,otherExpenses},listedWithholding,specialAccounts[{brokerName,branchName,withholdingAccount,revenue,cost,withholding}]}。配当控除の対象額は配当の内訳から自動で決まる",
          },
          agriculture: {
            type: "object",
            description:
              "農業所得の入力（任意、camelCase）: farmName、salesAmount（販売金額）、householdConsumption（家事消費・事業消費金額）、miscRevenue（雑収入）、produceOpeningInventory/produceClosingInventory（農産物の棚卸高）、otherOpeningInventory/otherClosingInventory（農産物以外の棚卸高）、expenseTotals（科目名→金額の合計。支出は正の金額）、familyWorkerSalary（専従者給与・青色）、familyWorkerDeduction（専従者控除・白色）、badDebtProvisionIn/badDebtProvisionBack（貸倒引当金）、cultivationCostDeduction（育成費用）、beefCattleExemptionAmount（肉用牛特例金額・表示のみ）。農業所得は帳簿の取引とは混ぜず、決算書（農業所得用）の計算と青色申告特別控除の配分まで行う",
          },
          filing_type: filingTypeProperty,
          real_estate_business_scale: realEstateScaleProperty,
        },
        required: ["year"],
      },
    },
    {
      name: "amendment_delta",
      description:
        "申告済み（original）と修正後（corrected）のフラットなJSONを比較し、項目ごとの差分と税額の増減を返す。",
      inputSchema: {
        type: "object",
        properties: {
          original: { type: "object", description: "申告済み内容のフラットなJSON" },
          corrected: { type: "object", description: "修正後内容のフラットなJSON" },
        },
        required: ["original", "corrected"],
      },
    },
    {
      name: "search_tax_knowledge",
      description:
        "税務知識ベース（国税庁タックスアンサーの本文を収録）を検索し、関連する制度・手続きの抜粋と出典（No.とURL）を返す。税率・控除の要件や上限、簡易課税のみなし仕入率、申告・納付の手続きや期限など、税制のルールで不確かな点の確認に使う。金額の計算は他の計算ツールで行うこと。",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "検索キーワード（空白区切りで複数可。例: 簡易課税 みなし仕入率 第5種）",
          },
          limit: { type: "integer", description: "返す件数（任意、既定5、最大10）" },
        },
        required: ["query"],
      },
    },
  ],
  handlers: {
    aggregate_year: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const tx = await ledgerTransactions(db, year);
      const b = aggregateIncome(tx);
      const blue = blueDeduction(b.realEstateIncome, b.businessIncome, filingOptionsArg(args));
      return textResult({
        year,
        count: tx.length,
        business_revenue: b.businessRevenue,
        business_expenses: b.businessExpenses,
        business_income: b.businessIncome,
        real_estate_revenue: b.realEstateRevenue,
        real_estate_expenses: b.realEstateExpenses,
        real_estate_income: b.realEstateIncome,
        blue_deduction_real_estate: blue.realEstate,
        blue_deduction_business: blue.business,
        blue_deduction_total: blue.total,
        business_income_after_blue: b.businessIncome - blue.business,
        real_estate_income_after_blue: b.realEstateIncome - blue.realEstate,
        category_totals: categoryTotals(tx),
      });
    },
    consumption_tax: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const tx = await ledgerTransactions(db, year);
      const b = aggregateIncome(tx);
      const rent = residentialRentTotal(tx);
      const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
      const methods = (["standard", "simplified", "special20"] as const).map((method) => {
        const r = consumptionTax({
          taxableSalesIncl: taxable,
          nontaxableSalesIncl: nontaxable,
          inputTax: method === "standard" ? estimateInputTax(tx) : 0,
          method,
        });
        return {
          method: r.method,
          output_tax: r.outputTax,
          input_tax: r.inputTax,
          payable: r.payable,
          detail: r.detail,
        };
      });
      return textResult({
        year,
        taxable_sales_incl_tax: taxable,
        nontaxable_sales_incl_tax: nontaxable,
        methods,
        note: "本則の仕入税額は経費からの概算です。正式には請求書等で確定してください。",
      });
    },
    income_tax: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const filing = computeIncomeTaxFiling(
        incomeTaxFilingFromArgs(args, year, await ledgerTransactions(db, year)),
      );
      return textResult({
        ...filing.tax,
        ...(filing.expanded ? { expanded_income: filing.expanded } : {}),
        ...(filing.agricultureStatement ? { agriculture: filing.agricultureStatement } : {}),
      });
    },
    amendment_delta: async (args) => {
      const original = args["original"];
      const corrected = args["corrected"];
      if (
        typeof original !== "object" || original === null ||
        typeof corrected !== "object" || corrected === null
      ) {
        throw new Error("original と corrected の両方（JSONオブジェクト）が必要です");
      }
      const d = amendmentDelta(
        original as Record<string, unknown>,
        corrected as Record<string, unknown>,
      );
      return textResult({ year: d.year, field_diffs: d.fieldDiffs, tax_delta: d.taxDelta });
    },
    search_tax_knowledge: async (args) => {
      requireDb();
      const query = typeof args["query"] === "string" ? args["query"] : "";
      if (!query.trim()) throw new Error("query（検索キーワード）が必要です");
      const limit =
        typeof args["limit"] === "number" ? Math.min(10, Math.max(1, Math.trunc(args["limit"]))) : 5;
      return textResult(await searchTaxKnowledge(query, limit));
    },
  },
};
