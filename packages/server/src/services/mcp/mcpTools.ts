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
  BlueDeductionOptions,
  DeductionInputs,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  FilingType,
  IncomeType,
  MiscIncomeInput,
  TaxCreditInputs,
  Transaction,
  VALID_INCOME_TYPES,
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  buildConsumptionXtx,
  buildXtxFiling,
  categoryTotals,
  computeConsumptionReturn,
  computeCorrectedFigures,
  computeIncomeTax,
  consumptionTax,
  estimateInputTax,
  residentialRentTotal,
  taxableSalesFromBreakdown,
} from "@etax/shared";
import { createSystemOneClient } from "../../gateways/systemOneGateway";
import { Db, getDb } from "../../lib/db";
import { getJevPromptOverride, getRegexRulesOverride, loadSystemOneConfig } from "../../lib/config";
import { databaseUnavailableMessage } from "../../lib/errors";
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
  effectiveFiscalYear,
  insertTransactionRow,
  listTransactionRows,
  transactionToApi,
  updateTransactionRow,
} from "../../repositories/transactionRepository";
import { classifyAccount } from "../classification/classifyAccount";
import { searchTaxKnowledge } from "../knowledge/searchTaxKnowledge";
import { statementCategoryTotals, toTaxpayer } from "../../usecases/exportXtx";
import { ExportXtxRequest } from "../../schemas/etax";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const yearProperty = { type: "integer", description: "対象年（西暦）" };

const filingTypeProperty = {
  type: "string",
  enum: ["blue65", "blue55", "blue10", "white"],
  description: "申告の種類（青色申告特別控除の区分、任意。既定は blue65）",
};

const realEstateScaleProperty = {
  type: "boolean",
  description: "不動産貸付けが事業的規模か（任意。既定は false）",
};

export const MCP_TOOLS: McpToolDef[] = [
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
      "帳簿DBの指定年の取引から、e-Tax ソフト/WEB版に組み込める申告等データ（XTX）を生成する。対応年分は2023〜2025。生成物は署名なしの下書きで、送信は e-Tax 側で本人が行う。",
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
          description: "雑所得（その他）の入力（任意）: revenue（収入金額）, income（所得金額）, kubun（その他区分）",
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
      "消費税申告書（一般用・本則）の e-Tax 申告等データ（XTX）を生成する。金額は税区分まで確定した税込金額で渡すこと（帳簿の概算は使わない）。課税売上割合95%以上は全額控除、それ以外は一括比例配分で計算する。生成物は署名なしの下書きで、送信は e-Tax 側で本人が行う。",
    inputSchema: {
      type: "object",
      properties: {
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

/** DB を必須とするツール用。接続できなければエラーを投げる。 */
function requireDb(): Db {
  const db = getDb();
  if (!db) throw new Error(databaseUnavailableMessage);
  return db;
}

/** DB行を指定した割り当て年度の shared 取引形式へ変換する。 */
function rowsToTransactions(rows: TransactionRow[], year: number): Transaction[] {
  return rows
    .filter((row) => effectiveFiscalYear(row) === year)
    .map((row) => ({
      date: row.date,
      year,
      description: row.description,
      amount: row.amount,
      account: row.account,
      category: row.category,
      income_type: row.incomeType as IncomeType,
      tax_category: row.taxCategory,
    }));
}

/** 対象年の帳簿取引（shared 形式）をDBから取る。 */
async function ledgerTransactions(db: Db, year: number): Promise<Transaction[]> {
  return rowsToTransactions(await listTransactionRows(db), year);
}

/** 所得控除の入力を、未指定項目ゼロで補完する（ネストも1段だけ補完）。 */
function mergeDeductionInputs(input: unknown): DeductionInputs {
  if (typeof input !== "object" || input === null) return EMPTY_DEDUCTION_INPUTS;
  const partial = input as Partial<DeductionInputs>;
  return {
    ...EMPTY_DEDUCTION_INPUTS,
    ...partial,
    lifeInsurance: { ...EMPTY_DEDUCTION_INPUTS.lifeInsurance, ...(partial.lifeInsurance ?? {}) },
    earthquakeInsurance: {
      ...EMPTY_DEDUCTION_INPUTS.earthquakeInsurance,
      ...(partial.earthquakeInsurance ?? {}),
    },
    dependents: { ...EMPTY_DEDUCTION_INPUTS.dependents, ...(partial.dependents ?? {}) },
    disability: { ...EMPTY_DEDUCTION_INPUTS.disability, ...(partial.disability ?? {}) },
  };
}

/** 税額控除の入力を、未指定項目ゼロで補完する。 */
function mergeTaxCreditInputs(input: unknown): TaxCreditInputs {
  if (typeof input !== "object" || input === null) return EMPTY_TAX_CREDIT_INPUTS;
  return { ...EMPTY_TAX_CREDIT_INPUTS, ...(input as Partial<TaxCreditInputs>) };
}

/** 所得区分の検証。未指定は business、不正な値はエラーにする。 */
function parseIncomeType(value: unknown): IncomeType {
  if (value === undefined || value === null) return "business";
  if (typeof value === "string" && VALID_INCOME_TYPES.has(value)) return value as IncomeType;
  throw new Error(`income_type が不正です: ${String(value)}`);
}

/** 数値引数。未指定なら fallback、不正な型はエラーにする。 */
function numArg(args: Record<string, unknown>, key: string, fallback = 0): number {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} は数値で渡してください`);
  }
  return Math.trunc(value);
}

/** 数値引数（nullable）。未指定は null。 */
function nullableNumArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} は数値で渡してください`);
  }
  return Math.trunc(value);
}

const FILING_TYPES: readonly string[] = ["blue65", "blue55", "blue10", "white"];

/** 申告設定の引数（filing_type / real_estate_business_scale）を計算用オプションに変換する。 */
function filingOptionsArg(args: Record<string, unknown>): BlueDeductionOptions {
  const filingType = args["filing_type"];
  return {
    filingType: typeof filingType === "string" && FILING_TYPES.includes(filingType)
      ? (filingType as FilingType)
      : undefined,
    realEstateBusinessScale: args["real_estate_business_scale"] === true,
  };
}

/** 雑所得（その他）の引数を入力形式に変換する。未指定・不正なら空。 */
function miscIncomeArg(args: Record<string, unknown>): MiscIncomeInput {
  const raw = args["misc_income"];
  if (typeof raw !== "object" || raw === null) return EMPTY_MISC_INCOME;
  const rec = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
  return { revenue: num(rec["revenue"]), income: num(rec["income"]), kubun: num(rec["kubun"]) };
}

/** 今日の日付（日本時間、YYYY-MM-DD）。 */
function todayInTokyo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function textResult(value: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** MCP ツールの実行。例外は isError の結果として返す（呼び出し側で判断できるように）。 */
export async function dispatchMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  try {
    switch (name) {
      case "aggregate_year": {
        const db = requireDb();
        const year = Number(args["year"]);
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
        const year = Number(args["year"]);
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
        const year = Number(args["year"]);
        const tx = await ledgerTransactions(db, year);
        const figures = computeCorrectedFigures(tx, year, filingOptionsArg(args));
        const result = computeIncomeTax({
          year,
          totalIncome:
            figures._detail.business_income +
            figures._detail.real_estate_income +
            miscIncomeArg(args).income,
          deductions: mergeDeductionInputs(args["deductions"]),
          taxCredits: mergeTaxCreditInputs(args["tax_credits"]),
        });
        return textResult(result);
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
        const rows = await listTransactionRows(db);
        const year = typeof args["year"] === "number" ? args["year"] : undefined;
        const filtered = year ? rows.filter((row) => effectiveFiscalYear(row) === year) : rows;
        return textResult({
          count: filtered.length,
          transactions: filtered.map(transactionToApi),
        });
      }
      case "add_transaction": {
        const db = requireDb();
        const category = typeof args["category"] === "string" && args["category"] !== ""
          ? args["category"]
          : "未分類";
        const date = String(args["date"]);
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
          description: String(args["description"]),
          amount: Number(args["amount"]),
          account: typeof args["account"] === "string" ? args["account"] : "",
          category,
          incomeType: parseIncomeType(args["income_type"]),
          taxCategory: typeof args["tax_category"] === "string" ? args["tax_category"] : "",
        });
        if (!row) throw new Error("取引の登録に失敗しました");
        if (category !== "未分類") {
          await recordClassification(row.description, category);
        }
        return textResult({ transaction: transactionToApi(row) });
      }
      case "update_transaction": {
        const db = requireDb();
        const id = Number(args["id"]);
        const patch: Partial<TransactionRow> = {};
        if (typeof args["date"] === "string") patch.date = args["date"];
        if (
          typeof args["fiscal_year"] === "number" &&
          Number.isInteger(args["fiscal_year"]) &&
          args["fiscal_year"] >= 1900 &&
          args["fiscal_year"] <= 2100
        ) {
          patch.fiscalYear = args["fiscal_year"];
        }
        if (typeof args["description"] === "string") patch.description = args["description"];
        if (typeof args["amount"] === "number") patch.amount = args["amount"];
        if (typeof args["account"] === "string") patch.account = args["account"];
        if (typeof args["category"] === "string") patch.category = args["category"];
        if (args["income_type"] !== undefined) patch.incomeType = parseIncomeType(args["income_type"]);
        if (typeof args["tax_category"] === "string") patch.taxCategory = args["tax_category"];
        const row = await updateTransactionRow(db, id, patch);
        if (!row) throw new Error(`取引が見つかりません: id=${id}`);
        if (patch.category !== undefined && patch.category !== "未分類") {
          await recordClassification(row.description, patch.category);
        }
        return textResult({ transaction: transactionToApi(row) });
      }
      case "delete_transaction": {
        const db = requireDb();
        const id = Number(args["id"]);
        const row = await deleteTransactionRow(db, id);
        if (!row) throw new Error(`取引が見つかりません: id=${id}`);
        return textResult({ deleted: transactionToApi(row) });
      }
      case "classify_account": {
        const history = await loadClassificationHistory();
        const systemOne = createSystemOneClient(loadSystemOneConfig());
        const result = await classifyAccount(String(args["description"]), { history, systemOne, jevPromptOverride: getJevPromptOverride(), regexRulesOverride: getRegexRulesOverride() });
        return textResult(result);
      }
      case "classify_feedback": {
        await recordClassification(String(args["description"]), String(args["account"]));
        return textResult({ ok: true });
      }
      case "export_xtx": {
        const db = requireDb();
        const year = Number(args["year"]);
        const taxpayerArg = args["taxpayer"];
        if (typeof taxpayerArg !== "object" || taxpayerArg === null) {
          throw new Error("taxpayer（納税者情報）が必要です");
        }
        const tx = await ledgerTransactions(db, year);
        const deductions = mergeDeductionInputs(args["deductions"]);
        const taxCredits = mergeTaxCreditInputs(args["tax_credits"]);
        const figures = computeCorrectedFigures(tx, year, filingOptionsArg(args));
        const miscIncome = miscIncomeArg(args);
        const tax = computeIncomeTax({
          year,
          totalIncome:
            figures._detail.business_income + figures._detail.real_estate_income + miscIncome.income,
          deductions,
          taxCredits,
        });
        const amendment = args["amendment"] === true;
        const xtx = buildXtxFiling({
          year,
          amendment,
          submissionDate: typeof args["submission_date"] === "string"
            ? args["submission_date"]
            : todayInTokyo(),
          taxpayer: toTaxpayer(taxpayerArg as ExportXtxRequest["taxpayer"]),
          figures,
          deductionInputs: deductions,
          miscIncome,
          tax,
          categoryTotals: {
            business: statementCategoryTotals(tx, "business"),
            realEstate: statementCategoryTotals(tx, "real_estate"),
          },
          withholdingTax: typeof args["withholding_tax"] === "number" ? args["withholding_tax"] : 0,
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
        const taxpayerArg = args["taxpayer"];
        if (typeof taxpayerArg !== "object" || taxpayerArg === null) {
          throw new Error("taxpayer（納税者情報）が必要です");
        }
        const periodFrom = String(args["period_from"] ?? "");
        const periodTo = String(args["period_to"] ?? "");
        if (!periodFrom || !periodTo) throw new Error("period_from と period_to が必要です");
        const filingKind = numArg(args, "filing_kind", 1);
        if (filingKind !== 1 && filingKind !== 3) {
          throw new Error("filing_kind は 1（確定）か 3（修正確定）で渡してください");
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
          taxpayer: toTaxpayer(taxpayerArg as ExportXtxRequest["taxpayer"]),
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
      case "get_filing_status": {
        const db = requireDb();
        const rows = await listFilingStatusRows(db);
        return textResult({ statuses: rows.map(filingStatusToApi) });
      }
      case "set_filing_status": {
        const db = requireDb();
        const year = Number(args["year"]);
        const row = await upsertFilingStatusRow(db, year, {
          confirmed: typeof args["confirmed"] === "boolean" ? args["confirmed"] : undefined,
          calculated: typeof args["calculated"] === "boolean" ? args["calculated"] : undefined,
          submitted: typeof args["submitted"] === "boolean" ? args["submitted"] : undefined,
        });
        if (!row) throw new Error("申告ステータスの更新に失敗しました");
        return textResult({ status: filingStatusToApi(row) });
      }
      default:
        return {
          content: [{ type: "text", text: `未知のツールです: ${name}` }],
          isError: true,
        };
    }
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      isError: true,
    };
  }
}
