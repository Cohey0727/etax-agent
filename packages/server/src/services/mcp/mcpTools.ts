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
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  buildConsumptionXtx,
  buildSimplifiedConsumptionXtx,
  buildSpecial20ConsumptionXtx,
  buildXtxFiling,
  categoryTotals,
  computeAgricultureStatement,
  computeConsumptionReturn,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  consumptionTax,
  depreciationForYear,
  estimateInputTax,
  expandedWithholdingTotal,
  isAgricultureEmpty,
  normalizeBusinessRatio,
  residentialRentTotal,
  resolveTaxCreditInputs,
  computeManualIncomes,
  smallSpecialUsage,
  taxableSalesFromBreakdown,
  xtxSupportedYears,
} from "@etax/shared";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { billingEnabled } from "../../gateways/stripeGateway";
import { createSystemOneClient } from "../../gateways/systemOneGateway";
import { getJevPromptOverride, getRegexRulesOverride, loadSystemOneConfig } from "../../lib/config";
import { errorMessage } from "../../lib/errors";
import { authRequired } from "../../lib/tenantContext";
import { hasActivePlan } from "../../repositories/subscriptionRepository";
import {
  loadClassificationHistory,
  recordClassification,
} from "../../repositories/classificationHistoryRepository";
import {
  filingStatusToApi,
  listFilingStatusRows,
  upsertFilingStatusRow,
} from "../../repositories/filingStatusRepository";
import { TransactionRow } from "../../repositories/schema";
import {
  deleteTransactionRow,
  insertTransactionRow,
  listTransactionRows,
  transactionToApi,
  updateTransactionRow,
} from "../../repositories/transactionRepository";
import {
  depreciationDetailRowsForYear,
  fixedAssetToApi,
  fixedAssetToInput,
  insertFixedAssetRow,
  isActiveInYear,
  listFixedAssetRows,
} from "../../repositories/fixedAssetRepository";
import {
  linkReceiptRow,
  listReceiptRows,
  receiptToApi,
} from "../../repositories/receiptRepository";
import { classifyAccount } from "../classification/classifyAccount";
import { searchTaxKnowledge } from "../knowledge/searchTaxKnowledge";
import { mcpAssetTools } from "./mcpAssetTools";
import { mcpBusinessStartTools } from "./mcpBusinessStartTools";
import { mcpCashFlowTools } from "./mcpCashFlowTools";
import { mcpImportTools } from "./mcpImportTools";
import { mcpInvoiceTools } from "./mcpInvoiceTools";
import { mcpLedgerTools } from "./mcpLedgerTools";
import { mcpMetaTools } from "./mcpMetaTools";
import { mcpProfileTools } from "./mcpProfileTools";
import { mcpSubmissionTools } from "./mcpSubmissionTools";
import { statementCategoryTotals, toTaxpayer } from "../../usecases/exportXtx";
import { CreateFixedAssetRequestSchema } from "../../schemas/fixedAsset";

export type { McpToolDef, McpToolResult } from "./mcpToolKit";
import type { McpToolDef, McpToolHandler, McpToolModule, McpToolResult } from "./mcpToolKit";
import {
  agricultureArg,
  expandedIncomeArg,
  filingOptionsArg,
  filingTypeProperty,
  idArg,
  ledgerTransactions,
  mergeDeductionInputs,
  mergeTaxCreditInputs,
  miscIncomeArg,
  numArg,
  nullableNumArg,
  parseIncomeType,
  realEstateScaleProperty,
  requireDb,
  salaryIncomeArg,
  taxpayerArg,
  textResult,
  todayInTokyo,
  yearArg,
  yearProperty,
} from "./mcpToolKit";

const CORE_MCP_TOOLS: McpToolDef[] = [
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
    name: "list_transactions",
    description: "帳簿DBの取引を返す。year を指定するとその年だけに絞る。",
    inputSchema: {
      type: "object",
      properties: { year: { type: "integer", description: "対象年（西暦、任意）" } },
    },
  },
  {
    name: "add_transaction",
    description:
      "帳簿DBに取引を1件追加する。amount は符号つき税込金額（収入は正、支出は負）。category に未分類以外を指定すると分類の学習履歴にも記録される。",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付（YYYY-MM-DD）" },
        description: { type: "string", description: "摘要" },
        amount: { type: "number", description: "符号つき税込金額" },
        account: { type: "string", description: "口座・支払手段など（任意）" },
        category: { type: "string", description: "勘定科目（任意、既定は未分類）" },
        income_type: {
          type: "string",
          enum: ["business", "real_estate", "other"],
          description: "所得区分（任意、既定は business）",
        },
        tax_category: {
          type: "string",
          description: "消費税の税区分（任意。課税売上10% / 課対仕入10% / 非課売上 / 対象外 など）",
        },
        fiscal_year: {
          type: "integer",
          description: "割り当て年度（任意。既定は日付の年。日付と違う年へ計上する場合に指定）",
        },
        business_ratio_percent: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "事業専用割合（家事按分、0〜100の整数。任意、既定は100＝全額事業分）",
        },
        business_ratio_basis: {
          type: "string",
          description: "按分根拠のメモ（任意。例: 面積割合 20㎡/60㎡）",
        },
      },
      required: ["date", "description", "amount"],
    },
  },
  {
    name: "update_transaction",
    description: "帳簿DBの取引を部分更新する。id 以外は変更したい項目だけ渡す。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "取引ID" },
        date: { type: "string" },
        fiscal_year: { type: "integer", description: "割り当て年度" },
        description: { type: "string" },
        amount: { type: "number" },
        account: { type: "string" },
        category: { type: "string" },
        income_type: { type: "string", enum: ["business", "real_estate", "other"] },
        tax_category: { type: "string" },
        business_ratio_percent: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "事業専用割合（家事按分、0〜100の整数）",
        },
        business_ratio_basis: { type: "string", description: "按分根拠のメモ" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_transaction",
    description: "帳簿DBの取引を1件削除する。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", description: "取引ID" } },
      required: ["id"],
    },
  },
  {
    name: "classify_account",
    description:
      "摘要から勘定科目を判定する（過去の学習履歴 → SystemOne → キーワードルールの順）。候補と確信度も返す。",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "摘要" },
        amount: { type: "number", description: "金額（任意、判定の参考）" },
      },
      required: ["description"],
    },
  },
  {
    name: "classify_feedback",
    description: "確定した勘定科目を学習履歴に記録する。次回以降の classify_account で優先される。",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "摘要" },
        account: { type: "string", description: "確定した勘定科目" },
      },
      required: ["description", "account"],
    },
  },
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
  {
    name: "register_fixed_asset",
    description:
      "固定資産台帳に資産を登録する。method は straight_line（定額法）/ declining_balance（定率法200%）/ lump_sum（一括償却資産）/ small_special（少額減価償却資産の特例）から選ぶ。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "資産の名称等" },
        quantity: { type: "string", description: "面積又は数量（任意）" },
        income_type: { type: "string", enum: ["business", "real_estate", "agriculture"], description: "所得区分（既定 business）" },
        acquisition_date: { type: "string", description: "取得年月日（YYYY-MM-DD）" },
        service_start_date: { type: "string", description: "事業供用年月日（任意、省略時は取得日）" },
        cost: { type: "integer", description: "取得価額（円、正の整数）" },
        useful_life_years: { type: "integer", description: "耐用年数（年、1以上の整数）" },
        method: {
          type: "string",
          enum: ["straight_line", "declining_balance", "lump_sum", "small_special"],
          description: "償却方法（既定 straight_line）",
        },
        business_ratio_percent: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "事業専用割合 0〜100の整数（既定100）",
        },
      },
      required: ["name", "acquisition_date", "cost", "useful_life_years"],
    },
  },
  {
    name: "list_fixed_assets",
    description: "固定資産台帳の一覧を返す。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_depreciation",
    description:
      "指定年の減価償却を台帳から計算する（資産ごとの普通償却費・必要経費算入額・未償却残高と、所得区分ごとの合計、少額特例の年間300万円上限の使用状況）。",
    inputSchema: {
      type: "object",
      properties: { year: yearProperty },
      required: ["year"],
    },
  },
  {
    name: "list_receipts",
    description: "証憑（領収書画像）の一覧を返す。各証憑の解析結果と、紐付いている取引IDを含む。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "link_receipt",
    description: "証憑（file_id）を取引（transaction_id）へ紐付ける。帳簿から証憑を辿れるようにするための操作。",
    inputSchema: {
      type: "object",
      properties: {
        file_id: { type: "string", description: "証憑のファイルID" },
        transaction_id: { type: "number", description: "紐付け先の取引ID" },
      },
      required: ["file_id", "transaction_id"],
    },
  },
  {
    name: "get_filing_status",
    description: "申告ステータス（確認・控除計算・提出の済み状態）を全年度分返す。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_filing_status",
    description: "指定年の申告ステータスを更新する。渡した項目だけが書き換わる（true で済み、false で未了）。",
    inputSchema: {
      type: "object",
      properties: {
        year: yearProperty,
        confirmed: { type: "boolean" },
        calculated: { type: "boolean" },
        submitted: { type: "boolean" },
      },
      required: ["year"],
    },
  },
];

/** ドメイン別ツールモジュール（定義と実行関数は各モジュールが持つ）。 */
const DOMAIN_TOOL_MODULES: McpToolModule[] = [
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
 * プランゲート（REST 側 planGateMiddleware と同じ条件、Issue #8）。
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

/**
 * 保存済みの取引の科目を学習履歴に記録する。取引はすでに確定しているため、
 * 記録の失敗でツール全体を失敗にすると、クライアントの再実行で取引が
 * 二重に登録される。失敗は警告文として返す（成功なら null）。
 */
async function recordClassificationAfterSave(
  description: string,
  category: string,
): Promise<string | null> {
  try {
    await recordClassification(description, category);
    return null;
  } catch (e) {
    console.warn(`[mcp] 分類の学習履歴に記録できませんでした: ${errorMessage(e)}`);
    return `取引は保存しましたが、分類の学習履歴には記録できませんでした: ${errorMessage(e)}`;
  }
}

/** MCP ツールの実行。例外は isError の結果として返す（呼び出し側で判断できるように）。 */
export async function dispatchMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  try {
    await assertPlanForGatedTool(name);
    switch (name) {
      case "aggregate_year": {
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
      }
      case "consumption_tax": {
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
      }
      case "income_tax": {
        const db = requireDb();
        const year = yearArg(args);
        const tx = await ledgerTransactions(db, year);
        const agricultureInput = agricultureArg(args);
        const agriculture =
          agricultureInput && !isAgricultureEmpty(agricultureInput)
            ? computeAgricultureStatement(agricultureInput)
            : undefined;
        const figures = computeCorrectedFigures(tx, year, {
          ...filingOptionsArg(args),
          agriculture: agricultureInput,
        });
        const manual = computeManualIncomes(
          year,
          salaryIncomeArg(args),
          miscIncomeArg(args),
          figures._detail.business_income +
            figures._detail.real_estate_income +
            figures._detail.agriculture_income,
        );
        const expandedInput = expandedIncomeArg(args);
        const expanded = expandedInput ? computeExpandedIncomes(expandedInput) : undefined;
        const baseTaxCredits = mergeTaxCreditInputs(args["tax_credits"]);
        const result = computeIncomeTax({
          year,
          totalIncome:
            figures._detail.business_income +
            figures._detail.real_estate_income +
            figures._detail.agriculture_income +
            manual.total +
            (expanded?.comprehensiveAddition ?? 0),
          deductions: mergeDeductionInputs(args["deductions"]),
          taxCredits: expanded ? resolveTaxCreditInputs(baseTaxCredits, expanded) : baseTaxCredits,
          separateTaxation: expanded
            ? { stockIncome: expanded.separateStockIncome, dividendIncome: expanded.separateDividendIncome }
            : undefined,
        });
        return textResult({
          ...result,
          ...(expanded ? { expanded_income: expanded } : {}),
          ...(agriculture ? { agriculture } : {}),
        });
      }
      case "amendment_delta": {
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
      }
      case "list_transactions": {
        const db = requireDb();
        const year = args["year"] === undefined ? undefined : yearArg(args);
        const rows = await listTransactionRows(db, undefined, year);
        return textResult({
          count: rows.length,
          transactions: rows.map(transactionToApi),
        });
      }
      case "add_transaction": {
        const db = requireDb();
        const category = typeof args["category"] === "string" && args["category"] !== ""
          ? args["category"]
          : "未分類";
        // 引数の検証（Issue #11: 未検証の String()/Number() 変換で
        // "undefined" や NaN がそのまま保存されるのを防ぐ）。
        const date = args["date"];
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error("date は YYYY-MM-DD 形式で渡してください");
        }
        if (typeof args["description"] !== "string") {
          throw new Error("description（摘要）は文字列で渡してください");
        }
        if (args["amount"] === undefined || args["amount"] === null) {
          throw new Error("amount（符号つき税込金額）が必要です");
        }
        const fiscalYearArg = args["fiscal_year"];
        const row = await insertTransactionRow(db, {
          date,
          fiscalYear:
            typeof fiscalYearArg === "number" &&
            Number.isInteger(fiscalYearArg) &&
            fiscalYearArg >= 1900 &&
            fiscalYearArg <= 2100
              ? fiscalYearArg
              : Number(date.slice(0, 4)),
          description: args["description"],
          amount: numArg(args, "amount"),
          account: typeof args["account"] === "string" ? args["account"] : "",
          category,
          incomeType: parseIncomeType(args["income_type"]),
          taxCategory: typeof args["tax_category"] === "string" ? args["tax_category"] : "",
          businessRatioPercent: normalizeBusinessRatio(args["business_ratio_percent"]),
          businessRatioBasis:
            typeof args["business_ratio_basis"] === "string" ? args["business_ratio_basis"] : "",
        });
        if (!row) throw new Error("取引の登録に失敗しました");
        const warning =
          category !== "未分類" ? await recordClassificationAfterSave(row.description, category) : null;
        return textResult({ transaction: transactionToApi(row), ...(warning ? { warning } : {}) });
      }
      case "update_transaction": {
        const db = requireDb();
        const id = idArg(args, "id");
        const patch: Partial<TransactionRow> = {};
        if (typeof args["date"] === "string") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(args["date"])) {
            throw new Error("date は YYYY-MM-DD 形式で渡してください");
          }
          patch.date = args["date"];
        }
        if (
          typeof args["fiscal_year"] === "number" &&
          Number.isInteger(args["fiscal_year"]) &&
          args["fiscal_year"] >= 1900 &&
          args["fiscal_year"] <= 2100
        ) {
          patch.fiscalYear = args["fiscal_year"];
        }
        if (typeof args["description"] === "string") patch.description = args["description"];
        if (args["amount"] !== undefined) patch.amount = numArg(args, "amount");
        if (typeof args["account"] === "string") patch.account = args["account"];
        if (typeof args["category"] === "string") patch.category = args["category"];
        if (args["income_type"] !== undefined) patch.incomeType = parseIncomeType(args["income_type"]);
        if (typeof args["tax_category"] === "string") patch.taxCategory = args["tax_category"];
        if (typeof args["business_ratio_percent"] === "number") {
          patch.businessRatioPercent = normalizeBusinessRatio(args["business_ratio_percent"]);
        }
        if (typeof args["business_ratio_basis"] === "string") {
          patch.businessRatioBasis = args["business_ratio_basis"];
        }
        const row = await updateTransactionRow(db, id, patch);
        if (!row) throw new Error(`取引が見つかりません: id=${id}`);
        const warning =
          patch.category !== undefined && patch.category !== "未分類"
            ? await recordClassificationAfterSave(row.description, patch.category)
            : null;
        return textResult({ transaction: transactionToApi(row), ...(warning ? { warning } : {}) });
      }
      case "delete_transaction": {
        const db = requireDb();
        const id = idArg(args, "id");
        const row = await deleteTransactionRow(db, id);
        if (!row) throw new Error(`取引が見つかりません: id=${id}`);
        return textResult({ deleted: transactionToApi(row) });
      }
      case "classify_account": {
        const history = await loadClassificationHistory();
        const systemOne = createSystemOneClient(loadSystemOneConfig());
        const description = args["description"];
        if (typeof description !== "string" || description === "") {
          throw new Error("description（摘要）が必要です");
        }
        const result = await classifyAccount(description, { history, systemOne, jevPromptOverride: getJevPromptOverride(), regexRulesOverride: getRegexRulesOverride() });
        return textResult(result);
      }
      case "classify_feedback": {
        const description = args["description"];
        const account = args["account"];
        if (typeof description !== "string" || description === "" || typeof account !== "string" || account === "") {
          throw new Error("description（摘要）と account（勘定科目）が必要です");
        }
        await recordClassification(description, account);
        return textResult({ ok: true });
      }
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
      case "search_tax_knowledge": {
        requireDb();
        const query = typeof args["query"] === "string" ? args["query"] : "";
        if (!query.trim()) throw new Error("query（検索キーワード）が必要です");
        const limit =
          typeof args["limit"] === "number" ? Math.min(10, Math.max(1, Math.trunc(args["limit"]))) : 5;
        return textResult(await searchTaxKnowledge(query, limit));
      }
      case "register_fixed_asset": {
        const db = requireDb();
        const parsed = CreateFixedAssetRequestSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(
            "固定資産の入力が不正です（取得価額・耐用年数は正の整数、事業専用割合は0〜100の整数、日付は YYYY-MM-DD）",
          );
        }
        const body = parsed.data;
        const row = await insertFixedAssetRow(db, {
          name: body.name,
          quantity: body.quantity ?? "",
          incomeType: body.income_type ?? "business",
          acquisitionDate: body.acquisition_date,
          serviceStartDate: body.service_start_date ?? null,
          cost: body.cost,
          usefulLifeYears: body.useful_life_years,
          method: body.method ?? "straight_line",
          businessRatioPercent: body.business_ratio_percent ?? 100,
          disposedDate: body.disposed_date ?? null,
        });
        return textResult({ asset: row ? fixedAssetToApi(row) : null });
      }
      case "list_fixed_assets": {
        const db = requireDb();
        const rows = await listFixedAssetRows(db);
        return textResult({ assets: rows.map(fixedAssetToApi) });
      }
      case "get_depreciation": {
        const db = requireDb();
        const year = yearArg(args);
        const rows = (await listFixedAssetRows(db)).filter((row) => isActiveInYear(row, year));
        const detail = [];
        const totals = { business: 0, real_estate: 0, agriculture: 0 };
        for (const row of rows) {
          const dep = depreciationForYear(fixedAssetToInput(row), year);
          if (!dep) continue;
          detail.push({
            asset_id: row.id,
            name: row.name,
            income_type: row.incomeType,
            months: dep.months,
            opening_book_value: dep.openingBookValue,
            basis_amount: dep.basisAmount,
            rate: dep.rate,
            guarantee_amount: dep.guaranteeAmount,
            ordinary: dep.ordinary,
            deductible: dep.deductible,
            closing_book_value: dep.closingBookValue,
          });
          if (row.incomeType === "business") totals.business += dep.deductible;
          if (row.incomeType === "real_estate") totals.real_estate += dep.deductible;
          if (row.incomeType === "agriculture") totals.agriculture += dep.deductible;
        }
        return textResult({
          year,
          rows: detail,
          deductible_totals: totals,
          small_special: smallSpecialUsage(rows.map(fixedAssetToInput), year),
        });
      }
      case "list_receipts": {
        const db = requireDb();
        const rows = await listReceiptRows(db);
        return textResult({ receipts: rows.map(receiptToApi) });
      }
      case "link_receipt": {
        const db = requireDb();
        const fileId = args["file_id"];
        if (typeof fileId !== "string" || !fileId) throw new Error("file_id が必要です");
        const row = await linkReceiptRow(db, fileId, idArg(args, "transaction_id"));
        return textResult({ receipt: row ? receiptToApi(row) : null });
      }
      case "get_filing_status": {
        const db = requireDb();
        const rows = await listFilingStatusRows(db);
        return textResult({ statuses: rows.map(filingStatusToApi) });
      }
      case "set_filing_status": {
        const db = requireDb();
        const year = yearArg(args);
        const row = await upsertFilingStatusRow(db, year, {
          confirmed: typeof args["confirmed"] === "boolean" ? args["confirmed"] : undefined,
          calculated: typeof args["calculated"] === "boolean" ? args["calculated"] : undefined,
          submitted: typeof args["submitted"] === "boolean" ? args["submitted"] : undefined,
        });
        if (!row) throw new Error("申告ステータスの更新に失敗しました");
        return textResult({ status: filingStatusToApi(row) });
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
