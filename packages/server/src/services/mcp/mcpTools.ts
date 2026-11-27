/**
 * mcpTools.ts — MCP（外部エージェント連携）で公開するツール群（services/mcp）。
 *
 * アプリ内エージェント（services/agent）との違い:
 *   - こちらはサーバー自身の帳簿DBを正として読み書きする。外部エージェント
 *     （Muse / Grok 等の MCP クライアント）が、ユーザーの帳簿に対して
 *     集計・税額計算・分類・XTX出力を行えるようにするための口。
 *   - 数字の計算はすべて @etax/shared の決定的な関数が行う（LLMに計算させない、
 *     という本アプリの原則は外部エージェント相手でも同じ）。
 *   - e-Tax への最終提出は本ツール群でも行わない（納税者本人の操作）。
 */
import {
  buildConsumptionXtx,
  buildSimplifiedConsumptionXtx,
  buildSpecial20ConsumptionXtx,
  buildXtxFiling,
  computeAgricultureStatement,
  computeConsumptionReturn,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  expandedWithholdingTotal,
  isAgricultureEmpty,
  resolveTaxCreditInputs,
  computeManualIncomes,
  statementCategoryTotals,
  xtxSupportedYears,
} from "@etax/shared";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { billingEnabled } from "../../gateways/stripeGateway";
import { errorMessage } from "../../lib/errors";
import { authRequired } from "../../lib/tenantContext";
import { hasActivePlan } from "../../repositories/subscriptionRepository";
import {
  depreciationDetailRowsForYear,
  listFixedAssetRows,
} from "../../repositories/fixedAssetRepository";
import { mcpAssetTools } from "./mcpAssetTools";
import { mcpBusinessStartTools } from "./mcpBusinessStartTools";
import { mcpCalcTools } from "./mcpCalcTools";
import { mcpCashFlowTools } from "./mcpCashFlowTools";
import { mcpImportTools } from "./mcpImportTools";
import { mcpInvoiceTools } from "./mcpInvoiceTools";
import { mcpLedgerTools } from "./mcpLedgerTools";
import { mcpMetaTools } from "./mcpMetaTools";
import { mcpProfileTools } from "./mcpProfileTools";
import { mcpSubmissionTools } from "./mcpSubmissionTools";
import { toTaxpayer } from "../etax/xtxInputs";
import {
  McpToolDef,
  McpToolHandler,
  McpToolModule,
  McpToolResult,
  agricultureArg,
  expandedIncomeArg,
  filingOptionsArg,
  filingTypeProperty,
  ledgerTransactions,
  mergeDeductionInputs,
  mergeTaxCreditInputs,
  miscIncomeArg,
  numArg,
  nullableNumArg,
  realEstateScaleProperty,
  requireDb,
  salaryIncomeArg,
  taxpayerArg,
  textResult,
  todayInTokyo,
  yearArg,
  yearProperty,
} from "./mcpToolKit";

/** XTX（申告等データ）を出力するツール。他のツールはドメイン別モジュールが持つ。 */
const CORE_MCP_TOOLS: McpToolDef[] = [
  {
    name: "export_xtx",
    description:
      `帳簿DBの指定年の取引から、e-Tax ソフト/WEB版に組み込める申告等データ（XTX）を生成する。対応年分は${xtxSupportedYears()[0]}〜${xtxSupportedYears().at(-1)}。生成物は署名なしの下書きで、送信は e-Tax 側で本人が行う。`,
    inputSchema: {
      type: "object",
      properties: {
        year: yearProperty,
        amendment: { type: "boolean", description: "修正申告なら true（既定 false）" },
        submission_date: { type: "string", description: "提出日（YYYY-MM-DD、任意）" },
        taxpayer: {
          type: "object",
          description:
            "納税者情報（snake_case）: name, name_kana, zip_code, address, birth_date が主な項目。my_number 等は任意。",
        },
        deductions: { type: "object", description: "所得控除の入力（任意）" },
        tax_credits: { type: "object", description: "税額控除の入力（任意）" },
        misc_income: {
          type: "object",
          description:
            "雑所得の入力（任意）: revenue/income/kubun（その他）, pensionRevenue（公的年金等の収入金額）/pensionOver65（65歳以上か）, businessRevenue/businessIncome/businessKubun（業務）",
        },
        salary_income: {
          type: "object",
          description:
            "給与所得の入力（任意）: revenue（給与等の収入金額）, adjustmentEligible（所得金額調整控除の対象か）。所得金額は給与所得控除と調整控除で自動計算する",
        },
        expanded_income: {
          type: "object",
          description:
            "配当・一時・株式等譲渡の入力（任意、camelCase）: temp{revenue,expenses}、dividend{listedRevenue,listedTrustRevenue,listedWithholding,listedMode(comprehensive/separate/none),generalRevenue,generalTrustRevenue,generalWithholding,interestExpense}、stocks{general/listed{revenue,otherRevenue,acquisitionCost,transferFees,otherExpenses},listedWithholding,specialAccounts[{brokerName,branchName,withholdingAccount,revenue,cost,withholding}]}。申告分離課税がある場合は第三表、株式等譲渡がある場合は計算明細書（KOC080）を添付する。源泉徴収税額は拡張分を自動加算する",
        },
        agriculture: {
          type: "object",
          description:
            "農業所得の入力（任意、camelCase）: farmName、salesAmount（販売金額）、householdConsumption（家事消費・事業消費金額）、miscRevenue（雑収入）、produceOpeningInventory/produceClosingInventory（農産物の棚卸高）、otherOpeningInventory/otherClosingInventory（農産物以外の棚卸高）、expenseTotals（科目名→金額の合計。支出は正の金額）、familyWorkerSalary（専従者給与・青色）、familyWorkerDeduction（専従者控除・白色）、badDebtProvisionIn/badDebtProvisionBack（貸倒引当金）、cultivationCostDeduction（育成費用）、beefCattleExemptionAmount（肉用牛特例金額・表示のみ）。指定すると農業所得用の決算書（青色はKOA240、白色はKOA120）を添付し、申告書の農業欄と合計所得へ反映する。農業分は一般用の決算書には混ぜない",
        },
        filing_type: filingTypeProperty,
        real_estate_business_scale: realEstateScaleProperty,
        withholding_tax: { type: "number", description: "源泉徴収税額（任意）" },
        prepaid_tax: { type: "number", description: "予定納税額（任意）" },
        original_third_period_tax: {
          type: "number",
          description: "修正申告のときの修正前の税額（任意）",
        },
      },
      required: ["year", "taxpayer"],
    },
  },
  {
    name: "export_consumption_xtx",
    description:
      "消費税申告書の e-Tax 申告等データ（XTX）を生成する。method 省略時は一般用・本則（RSH0010）、method=simplified で簡易課税用（RSH0030、SHA020+付表4-3/5-3）。金額は税区分まで確定した税込金額で渡すこと（帳簿の概算は使わない）。本則は課税売上割合95%以上で全額控除、それ以外は一括比例配分。簡易は business_category（省略時5=サービス業）に全売上を寄せて専業者計算する。生成物は署名なしの下書きで、送信は e-Tax 側で本人が行う。",
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["standard", "simplified", "special20"],
          description: "計算方式: standard=本則（既定）、simplified=簡易課税、special20=2割特例",
        },
        business_category: {
          type: "integer",
          description:
            "簡易課税の事業区分（1=卸売 2=小売 3=製造等 4=その他 5=サービス等 6=不動産、省略時5）",
        },
        taxpayer: {
          type: "object",
          description:
            "納税者情報（snake_case）: name, name_kana, zip_code, address, birth_date, tax_office_name, tax_office_code 等。",
        },
        period_from: { type: "string", description: "課税期間の開始日（YYYY-MM-DD）" },
        period_to: { type: "string", description: "課税期間の終了日（YYYY-MM-DD）" },
        submission_date: { type: "string", description: "提出日（YYYY-MM-DD、任意）" },
        filing_kind: { type: "integer", description: "申告の種類: 1=確定（期限後申告も1）、3=修正確定（任意、既定1）" },
        base_period_sales_thousands: {
          type: "number",
          description: "基準期間の課税売上高（千円単位）",
        },
        sales_incl_10: { type: "number", description: "課税売上（税込）・税率10%分" },
        sales_incl_8: { type: "number", description: "課税売上（税込）・軽減税率8%分（任意）" },
        nontaxable_sales: { type: "number", description: "非課税売上（対価の額、任意）" },
        exempt_sales: { type: "number", description: "免税売上（対価の額、任意）" },
        purchases_incl_10: { type: "number", description: "課税仕入の支払対価（税込）・税率10%分" },
        purchases_incl_8: { type: "number", description: "課税仕入の支払対価（税込）・軽減税率8%分（任意）" },
        interim_national: { type: "number", description: "中間納付税額（国税、任意）" },
        interim_local: { type: "number", description: "中間納付譲渡割額（任意）" },
        original_national: { type: "number", description: "修正申告のときの既確定税額（国税、任意）" },
        original_local: { type: "number", description: "修正申告のときの既確定譲渡割額（任意）" },
      },
      required: [
        "taxpayer",
        "period_from",
        "period_to",
        "base_period_sales_thousands",
        "sales_incl_10",
        "purchases_incl_10",
      ],
    },
  },
];

/** ドメイン別ツールモジュール（定義と実行関数は各モジュールが持つ）。 */
const DOMAIN_TOOL_MODULES: McpToolModule[] = [
  mcpCalcTools,
  mcpProfileTools,
  mcpImportTools,
  mcpLedgerTools,
  mcpAssetTools,
  mcpMetaTools,
  mcpInvoiceTools,
  mcpCashFlowTools,
  mcpSubmissionTools,
  mcpBusinessStartTools,
];

/** 公開ツール一覧（コア＋ドメイン別モジュール）。 */
export const MCP_TOOLS: McpToolDef[] = [
  ...CORE_MCP_TOOLS,
  ...DOMAIN_TOOL_MODULES.flatMap((module) => module.tools),
];

const DOMAIN_HANDLERS: Record<string, McpToolHandler> = Object.assign(
  {},
  ...DOMAIN_TOOL_MODULES.map((module) => module.handlers),
);

/** REST の planGate（/api/etax/*）と対応する、課金対象の MCP ツール。 */
const PLAN_GATED_TOOLS: ReadonlySet<string> = new Set([
  "export_xtx",
  "export_consumption_xtx",
  "export_return_pdf",
  "export_opening_notice_pdf",
  "export_blue_return_pdf",
  "export_domicile_change_pdf",
]);

/**
 * プランゲート（REST 側 planGateMiddleware と同じ条件）。
 * SaaS モード（認証必須＋課金有効）のときだけ、/api/etax/* に対応する
 * 出力系ツールは有効なプランを必須にする。ローカル運用・課金未設定では
 * 制限しない。
 */
async function assertPlanForGatedTool(name: string): Promise<void> {
  if (!PLAN_GATED_TOOLS.has(name)) return;
  if (!authRequired() || !billingEnabled()) return;
  const db = requireDb();
  if (await hasActivePlan(db)) return;
  throw new Error("この機能は有料プラン（月額490円）への加入が必要です");
}


/** MCP ツールの実行。例外は isError の結果として返す（呼び出し側で判断できるように）。 */
export async function dispatchMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  try {
    await assertPlanForGatedTool(name);
    switch (name) {
      case "export_xtx": {
        const db = requireDb();
        const year = yearArg(args);
        if (typeof args["taxpayer"] !== "object" || args["taxpayer"] === null) {
          throw new Error("taxpayer（納税者情報）が必要です");
        }
        const tx = await ledgerTransactions(db, year);
        const deductions = mergeDeductionInputs(args["deductions"]);
        const taxCredits = mergeTaxCreditInputs(args["tax_credits"]);
        const agricultureInput = agricultureArg(args);
        const agricultureStatement =
          agricultureInput && !isAgricultureEmpty(agricultureInput)
            ? computeAgricultureStatement(agricultureInput)
            : undefined;
        const figures = computeCorrectedFigures(tx, year, {
          ...filingOptionsArg(args),
          agriculture: agricultureInput,
        });
        const miscIncome = miscIncomeArg(args);
        const salaryIncome = salaryIncomeArg(args);
        const manual = computeManualIncomes(
          year,
          salaryIncome,
          miscIncome,
          figures._detail.business_income +
            figures._detail.real_estate_income +
            figures._detail.agriculture_income,
        );
        const expandedInput = expandedIncomeArg(args);
        const expanded = expandedInput ? computeExpandedIncomes(expandedInput) : undefined;
        const tax = computeIncomeTax({
          year,
          totalIncome:
            figures._detail.business_income +
            figures._detail.real_estate_income +
            figures._detail.agriculture_income +
            manual.total +
            (expanded?.comprehensiveAddition ?? 0),
          deductions,
          taxCredits: expanded ? resolveTaxCreditInputs(taxCredits, expanded) : taxCredits,
          separateTaxation: expanded
            ? { stockIncome: expanded.separateStockIncome, dividendIncome: expanded.separateDividendIncome }
            : undefined,
        });
        const amendment = args["amendment"] === true;
        const assetRows = await listFixedAssetRows(db);
        const depreciation = depreciationDetailRowsForYear(assetRows, year);
        const xtx = buildXtxFiling({
          year,
          amendment,
          submissionDate: typeof args["submission_date"] === "string"
            ? args["submission_date"]
            : todayInTokyo(),
          taxpayer: toTaxpayer(taxpayerArg(args["taxpayer"])),
          figures,
          filingType: filingOptionsArg(args).filingType,
          depreciation:
            depreciation.business.length > 0 ||
            depreciation.realEstate.length > 0 ||
            depreciation.agriculture.length > 0
              ? depreciation
              : undefined,
          deductionInputs: deductions,
          miscIncome,
          salaryIncome,
          expandedIncome: expandedInput,
          agriculture: agricultureStatement
            ? {
                statement: agricultureStatement,
                blueDeduction: figures._detail.blue_deduction_agriculture,
              }
            : undefined,
          tax,
          categoryTotals: {
            business: statementCategoryTotals(tx, "business"),
            realEstate: statementCategoryTotals(tx, "real_estate"),
          },
          withholdingTax:
            (typeof args["withholding_tax"] === "number" ? args["withholding_tax"] : 0) +
            (expanded ? expandedWithholdingTotal(expanded) : 0),
          prepaidTax: typeof args["prepaid_tax"] === "number" ? args["prepaid_tax"] : 0,
          originalThirdPeriodTax: typeof args["original_third_period_tax"] === "number"
            ? args["original_third_period_tax"]
            : null,
        });
        return textResult({
          filename: `etax-shotoku-${year}${amendment ? "-shusei" : "-kakutei"}.xtx`,
          xtx,
        });
      }
      case "export_consumption_xtx": {
        if (typeof args["taxpayer"] !== "object" || args["taxpayer"] === null) {
          throw new Error("taxpayer（納税者情報）が必要です");
        }
        const periodFrom = String(args["period_from"] ?? "");
        const periodTo = String(args["period_to"] ?? "");
        if (!periodFrom || !periodTo) throw new Error("period_from と period_to が必要です");
        const filingKind = numArg(args, "filing_kind", 1);
        if (filingKind !== 1 && filingKind !== 3) {
          throw new Error("filing_kind は 1（確定）か 3（修正確定）で渡してください");
        }
        const submissionDate = typeof args["submission_date"] === "string"
          ? args["submission_date"]
          : todayInTokyo();
        if (args["method"] === "simplified") {
          const category = numArg(args, "business_category", 5);
          if (category < 1 || category > 6) {
            throw new Error("business_category は 1〜6 で渡してください");
          }
          const simplifiedInput = {
            salesByCategory: {
              [category]: {
                incl10: numArg(args, "sales_incl_10"),
                incl8: numArg(args, "sales_incl_8"),
              },
            },
            nontaxableSales: numArg(args, "nontaxable_sales"),
            exemptSales: numArg(args, "exempt_sales"),
            returnsIncl10: numArg(args, "returns_incl_10"),
            returnsIncl8: numArg(args, "returns_incl_8"),
            badDebtRecoveryTax10: numArg(args, "bad_debt_recovery_tax_10"),
            badDebtRecoveryTax8: numArg(args, "bad_debt_recovery_tax_8"),
            badDebtTax10: numArg(args, "bad_debt_tax_10"),
            badDebtTax8: numArg(args, "bad_debt_tax_8"),
            interimNational: numArg(args, "interim_national"),
            interimLocal: numArg(args, "interim_local"),
          };
          const simplifiedResult = computeSimplifiedConsumptionReturn(simplifiedInput);
          const xtx = buildSimplifiedConsumptionXtx({
            taxpayer: toTaxpayer(taxpayerArg(args["taxpayer"])),
            periodFrom,
            periodTo,
            submissionDate,
            filingKind: filingKind as 1 | 3,
            basePeriodSales: numArg(args, "base_period_sales_thousands") * 1000,
            input: simplifiedInput,
            result: simplifiedResult,
            originalNational: nullableNumArg(args, "original_national"),
            originalLocal: nullableNumArg(args, "original_local"),
          });
          return textResult({
            filename: `etax-shohi-${periodFrom.slice(0, 4)}-kanni${filingKind === 3 ? "-shusei" : "-kakutei"}.xtx`,
            total_payable: simplifiedResult.totalPayable,
            method: "simplified",
            business_category: category,
            input_tax: simplifiedResult.inputTax,
            xtx,
          });
        }
        if (args["method"] === "special20") {
          const specialInput = {
            salesIncl10: numArg(args, "sales_incl_10"),
            salesIncl8: numArg(args, "sales_incl_8"),
            nontaxableSales: numArg(args, "nontaxable_sales"),
            exemptSales: numArg(args, "exempt_sales"),
            returnsIncl10: numArg(args, "returns_incl_10"),
            returnsIncl8: numArg(args, "returns_incl_8"),
            badDebtRecoveryTax10: numArg(args, "bad_debt_recovery_tax_10"),
            badDebtRecoveryTax8: numArg(args, "bad_debt_recovery_tax_8"),
            badDebtTax10: numArg(args, "bad_debt_tax_10"),
            badDebtTax8: numArg(args, "bad_debt_tax_8"),
            interimNational: numArg(args, "interim_national"),
            interimLocal: numArg(args, "interim_local"),
          };
          const specialResult = computeSpecial20ConsumptionReturn(specialInput);
          const xtx = buildSpecial20ConsumptionXtx({
            taxpayer: toTaxpayer(taxpayerArg(args["taxpayer"])),
            periodFrom,
            periodTo,
            submissionDate,
            filingKind: filingKind as 1 | 3,
            basePeriodSalesThousands: numArg(args, "base_period_sales_thousands"),
            input: specialInput,
            result: specialResult,
            originalNational: nullableNumArg(args, "original_national"),
            originalLocal: nullableNumArg(args, "original_local"),
          });
          return textResult({
            filename: `etax-shohi-${periodFrom.slice(0, 4)}-special20${filingKind === 3 ? "-shusei" : "-kakutei"}.xtx`,
            total_payable: specialResult.totalPayable,
            method: "special20",
            special_credit: specialResult.specialCredit,
            xtx,
          });
        }
        const input = {
          salesIncl10: numArg(args, "sales_incl_10"),
          salesIncl8: numArg(args, "sales_incl_8"),
          nontaxableSales: numArg(args, "nontaxable_sales"),
          exemptSales: numArg(args, "exempt_sales"),
          purchasesIncl10: numArg(args, "purchases_incl_10"),
          purchasesIncl8: numArg(args, "purchases_incl_8"),
          interimNational: numArg(args, "interim_national"),
          interimLocal: numArg(args, "interim_local"),
        };
        const result = computeConsumptionReturn(input);
        const xtx = buildConsumptionXtx({
          taxpayer: toTaxpayer(taxpayerArg(args["taxpayer"])),
          periodFrom,
          periodTo,
          submissionDate: typeof args["submission_date"] === "string"
            ? args["submission_date"]
            : todayInTokyo(),
          filingKind: filingKind as 1 | 3,
          basePeriodSalesThousands: numArg(args, "base_period_sales_thousands"),
          input,
          result,
          originalNational: nullableNumArg(args, "original_national"),
          originalLocal: nullableNumArg(args, "original_local"),
        });
        return textResult({
          filename: `etax-shohi-${periodFrom.slice(0, 4)}${filingKind === 3 ? "-shusei" : "-kakutei"}.xtx`,
          total_payable: result.totalPayable,
          ratio: result.ratio,
          full_deduction: result.fullDeduction,
          xtx,
        });
      }
      default: {
        const domainHandler = DOMAIN_HANDLERS[name];
        if (domainHandler) return await domainHandler(args);
        return {
          content: [{ type: "text", text: `未知のツールです: ${name}` }],
          isError: true,
        };
      }
    }
  } catch (e) {
    return { content: [{ type: "text", text: toolErrorText(e) }], isError: true };
  }
}

/**
 * ツールの例外をクライアントへ返す文言にする。DB の例外は SQL 文とパラメータを
 * 含むため、クライアントへは返さずサーバーログにだけ残す。
 */
function toolErrorText(e: unknown): string {
  if (e instanceof DrizzleQueryError) {
    console.warn(`[mcp] DB の操作に失敗しました: ${e.message}`, e.cause);
    return "Error: データベースの操作に失敗しました（入力値が範囲外か、データベースに接続できません）";
  }
  return `${e instanceof Error ? e.name : "Error"}: ${errorMessage(e)}`;
}
