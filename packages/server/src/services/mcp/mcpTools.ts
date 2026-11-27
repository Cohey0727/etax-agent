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
import { xtxSupportedYears } from "@etax/shared";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { billingEnabled } from "../../gateways/stripeGateway";
import { errorMessage } from "../../lib/errors";
import { authRequired } from "../../lib/tenantContext";
import { hasActivePlan } from "../../repositories/subscriptionRepository";
import { ExportConsumptionXtxRequestSchema } from "../../schemas/etax";
import { generateConsumptionTaxXtx } from "../etax/generateConsumptionTaxXtx";
import { generateIncomeTaxXtx } from "../etax/generateIncomeTaxXtx";
import { depreciationFromLedger } from "../etax/xtxInputs";
import { mcpAssetTools } from "./mcpAssetTools";
import { mcpBusinessStartTools, savedTaxpayerProfile } from "./mcpBusinessStartTools";
import { incomeTaxReturnFromArgs, mcpCalcTools } from "./mcpCalcTools";
import { mcpCashFlowTools } from "./mcpCashFlowTools";
import { mcpImportTools } from "./mcpImportTools";
import { mcpInvoiceTools } from "./mcpInvoiceTools";
import { mcpLedgerTools } from "./mcpLedgerTools";
import { mcpMetaTools } from "./mcpMetaTools";
import { mcpProfileTools } from "./mcpProfileTools";
import { mcpSubmissionTools } from "./mcpSubmissionTools";
import {
  McpToolDef,
  McpToolHandler,
  McpToolModule,
  McpToolResult,
  filingTypeProperty,
  realEstateScaleProperty,
  requireDb,
  taxpayerArg,
  textResult,
  todayInTokyo,
  yearProperty,
} from "./mcpToolKit";

/** XTX（申告等データ）を出力するツール。他のツールはドメイン別モジュールが持つ。 */
const CORE_MCP_TOOLS: McpToolDef[] = [
  {
    name: "export_xtx",
    description:
      `帳簿DBの指定年の取引から、e-Tax ソフト/WEB版に組み込める申告等データ（XTX）を生成する。対応年分は${xtxSupportedYears()[0]}〜${xtxSupportedYears().at(-1)}。計算は income_tax と同じ。固定資産台帳の減価償却明細を決算書に載せる。REST の XTX 出力と同じ公式 XSD の検証を行い、違反ならエラー、検証できなければ理由を xsd_warning に入れて返す。生成物は署名なしの下書きで、送信は e-Tax 側で本人が行う。`,
    inputSchema: {
      type: "object",
      properties: {
        year: yearProperty,
        amendment: { type: "boolean", description: "修正申告なら true（既定 false）" },
        submission_date: { type: "string", description: "提出日（YYYY-MM-DD、任意）" },
        taxpayer: {
          type: "object",
          description:
            "納税者情報（snake_case）: name, name_kana, zip_code, address, birth_date が主な項目。my_number 等は任意。省略時は対象年の保存済みプロフィールを使う。",
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
      required: ["year"],
    },
  },
  {
    name: "export_consumption_xtx",
    description:
      "消費税申告書の e-Tax 申告等データ（XTX）を生成する。method 省略時は一般用・本則（RSH0010）、method=simplified で簡易課税用（RSH0030、SHA020+付表4-3/5-3）、method=special20 で2割特例（SHA010+付表6）。金額は税区分まで確定した税込金額で渡すこと（帳簿の概算は使わない）。本則は課税売上割合95%以上で全額控除、それ以外は一括比例配分。簡易は sales_by_category（事業区分ごとの売上）か、無ければ business_category（省略時5=サービス業）に全売上を寄せる。REST の消費税 XTX 出力と同じ計算・公式 XSD の検証を行い、検証できなければ理由を xsd_warning に入れて返す。生成物は署名なしの下書きで、送信は e-Tax 側で本人が行う。",
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
            "納税者情報（snake_case）: name, name_kana, zip_code, address, birth_date, tax_office_name, tax_office_code 等。省略時は課税期間の年の保存済みプロフィールを使う。",
        },
        sales_by_category: {
          type: "object",
          description:
            "簡易課税の事業区分ごとの課税売上（任意）: {\"1\"〜\"6\": {incl_10, incl_8}}（税込）。指定すると business_category と sales_incl_* より優先する",
        },
        returns_incl_10: { type: "number", description: "売上対価の返還等（税込）・税率10%分（簡易課税・2割特例、任意）" },
        returns_incl_8: { type: "number", description: "売上対価の返還等（税込）・軽減税率8%分（簡易課税・2割特例、任意）" },
        bad_debt_recovery_tax_10: { type: "number", description: "貸倒回収に係る消費税額・税率10%分（簡易課税・2割特例、任意）" },
        bad_debt_recovery_tax_8: { type: "number", description: "貸倒回収に係る消費税額・軽減税率8%分（簡易課税・2割特例、任意）" },
        bad_debt_tax_10: { type: "number", description: "貸倒れに係る税額・税率10%分（簡易課税・2割特例、任意）" },
        bad_debt_tax_8: { type: "number", description: "貸倒れに係る税額・軽減税率8%分（簡易課税・2割特例、任意）" },
        period_from: { type: "string", description: "課税期間の開始日（YYYY-MM-DD）" },
        period_to: { type: "string", description: "課税期間の終了日（YYYY-MM-DD）" },
        submission_date: { type: "string", description: "提出日（YYYY-MM-DD、任意）" },
        filing_kind: { type: "integer", description: "申告の種類: 1=確定（期限後申告も1）、3=修正確定（任意、既定1）" },
        base_period_sales_thousands: {
          type: "number",
          description: "基準期間の課税売上高（千円単位）",
        },
        sales_incl_10: { type: "number", description: "課税売上（税込）・税率10%分（任意）" },
        sales_incl_8: { type: "number", description: "課税売上（税込）・軽減税率8%分（任意）" },
        nontaxable_sales: { type: "number", description: "非課税売上（対価の額、任意）" },
        exempt_sales: { type: "number", description: "免税売上（対価の額、任意）" },
        purchases_incl_10: { type: "number", description: "課税仕入の支払対価（税込）・税率10%分（本則、任意）" },
        purchases_incl_8: { type: "number", description: "課税仕入の支払対価（税込）・軽減税率8%分（任意）" },
        interim_national: { type: "number", description: "中間納付税額（国税、任意）" },
        interim_local: { type: "number", description: "中間納付譲渡割額（任意）" },
        original_national: { type: "number", description: "修正申告のときの既確定税額（国税、任意）" },
        original_local: { type: "number", description: "修正申告のときの既確定譲渡割額（任意）" },
      },
      required: ["period_from", "period_to", "base_period_sales_thousands"],
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
        const request = await incomeTaxReturnFromArgs(db, args);
        const generated = await generateIncomeTaxXtx({
          ...request,
          depreciation: await depreciationFromLedger(db, request.filing.year),
        });
        return textResult({
          filename: generated.filename,
          xsd_warning: generated.xsdWarning,
          xtx: generated.xtx,
        });
      }
      case "export_consumption_xtx": {
        // 納税者情報を省いたら、課税期間の年の保存済みプロフィールを使う。課税期間が
        // 読めなければ探さず、スキーマの検証で period_from の不備として返す
        const periodYear =
          typeof args["period_from"] === "string" ? /^(\d{4})-/.exec(args["period_from"])?.[1] : undefined;
        const taxpayer =
          args["taxpayer"] !== undefined
            ? taxpayerArg(args["taxpayer"])
            : periodYear !== undefined
              ? taxpayerArg(await savedTaxpayerProfile(requireDb(), Number(periodYear)))
              : undefined;
        const amountOrZero = (key: string): unknown => args[key] ?? 0;
        const parsed = ExportConsumptionXtxRequestSchema.safeParse({
          ...args,
          taxpayer,
          submission_date: args["submission_date"] ?? todayInTokyo(),
          filing_kind: args["filing_kind"] ?? 1,
          sales_incl_10: amountOrZero("sales_incl_10"),
          sales_incl_8: amountOrZero("sales_incl_8"),
          nontaxable_sales: amountOrZero("nontaxable_sales"),
          exempt_sales: amountOrZero("exempt_sales"),
          purchases_incl_10: amountOrZero("purchases_incl_10"),
          purchases_incl_8: amountOrZero("purchases_incl_8"),
          interim_national: amountOrZero("interim_national"),
          interim_local: amountOrZero("interim_local"),
          original_national: args["original_national"] ?? null,
          original_local: args["original_local"] ?? null,
        });
        if (!parsed.success) {
          const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
          throw new Error(`消費税XTXの入力が不正です（${fields.join("、")}）`);
        }
        const generated = await generateConsumptionTaxXtx(parsed.data);
        return textResult({
          filename: generated.filename,
          method: parsed.data.method ?? "standard",
          total_payable: generated.totalPayable,
          xsd_warning: generated.xsdWarning,
          xtx: generated.xtx,
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
