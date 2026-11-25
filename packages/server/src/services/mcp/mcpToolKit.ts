/**
 * mcpToolKit.ts — MCP ツール群の共通部品（services/mcp）。
 *
 * ツール定義の型・引数プロパティの雛形・引数変換と DB 取得などの
 * ヘルパーを、ドメイン別のツールモジュール（mcpTools / mcpProfileTools 等）
 * で共有するために切り出したもの。計算そのものは持たない。
 */
import {
  BlueDeductionOptions,
  DeductionInputs,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  FilingType,
  IncomeType,
  MiscIncomeInput,
  SalaryIncomeInput,
  TaxCreditInputs,
  Transaction,
  VALID_INCOME_TYPES,
} from "@etax/shared";
import { Db, getDb } from "../../lib/db";
import { databaseUnavailableMessage } from "../../lib/errors";
import { TransactionRow } from "../../repositories/schema";
import {
  effectiveFiscalYear,
  listTransactionRows,
} from "../../repositories/transactionRepository";

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

/** ツール1件の実行関数（引数は検証前の生 JSON）。 */
export type McpToolHandler = (args: Record<string, unknown>) => Promise<McpToolResult>;

/** ドメイン別ツールモジュールが公開する形（定義と実行関数の対応表）。 */
export interface McpToolModule {
  tools: McpToolDef[];
  handlers: Record<string, McpToolHandler>;
}

export const yearProperty = { type: "integer", description: "対象年（西暦）" };

export const filingTypeProperty = {
  type: "string",
  enum: ["blue65", "blue55", "blue10", "white"],
  description: "申告の種類（青色申告特別控除の区分、任意。既定は blue65）",
};

export const realEstateScaleProperty = {
  type: "boolean",
  description: "不動産貸付けが事業的規模か（任意。既定は false）",
};

/** DB を必須とするツール用。接続できなければエラーを投げる。 */
export function requireDb(): Db {
  const db = getDb();
  if (!db) throw new Error(databaseUnavailableMessage);
  return db;
}

/** DB行を指定した割り当て年度の shared 取引形式へ変換する。 */
export function rowsToTransactions(rows: TransactionRow[], year: number): Transaction[] {
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
      business_ratio_percent: row.businessRatioPercent,
      business_ratio_basis: row.businessRatioBasis,
    }));
}

/** 対象年の帳簿取引（shared 形式）をDBから取る（年度絞り込みは SQL 側）。 */
export async function ledgerTransactions(db: Db, year: number): Promise<Transaction[]> {
  return rowsToTransactions(await listTransactionRows(db, undefined, year), year);
}

/** 所得控除の入力を、未指定項目ゼロで補完する（ネストも1段だけ補完）。 */
export function mergeDeductionInputs(input: unknown): DeductionInputs {
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
export function mergeTaxCreditInputs(input: unknown): TaxCreditInputs {
  if (typeof input !== "object" || input === null) return EMPTY_TAX_CREDIT_INPUTS;
  return { ...EMPTY_TAX_CREDIT_INPUTS, ...(input as Partial<TaxCreditInputs>) };
}

/** 所得区分の検証。未指定は business、不正な値はエラーにする。 */
export function parseIncomeType(value: unknown): IncomeType {
  if (value === undefined || value === null) return "business";
  if (typeof value === "string" && VALID_INCOME_TYPES.has(value)) return value as IncomeType;
  throw new Error(`income_type が不正です: ${String(value)}`);
}

/** 数値引数。未指定なら fallback、不正な型はエラーにする。 */
export function numArg(args: Record<string, unknown>, key: string, fallback = 0): number {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} は数値で渡してください`);
  }
  return Math.trunc(value);
}

/** 数値引数（nullable）。未指定は null。 */
export function nullableNumArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} は数値で渡してください`);
  }
  return Math.trunc(value);
}

const FILING_TYPES: readonly string[] = ["blue65", "blue55", "blue10", "white"];

/** 申告設定の引数（filing_type / real_estate_business_scale）を計算用オプションに変換する。 */
export function filingOptionsArg(args: Record<string, unknown>): BlueDeductionOptions {
  const filingType = args["filing_type"];
  return {
    filingType: typeof filingType === "string" && FILING_TYPES.includes(filingType)
      ? (filingType as FilingType)
      : undefined,
    realEstateBusinessScale: args["real_estate_business_scale"] === true,
  };
}

/** 雑所得の引数を入力形式に変換する。未指定・不正なら空。 */
export function miscIncomeArg(args: Record<string, unknown>): MiscIncomeInput {
  const raw = args["misc_income"];
  if (typeof raw !== "object" || raw === null) return EMPTY_MISC_INCOME;
  const rec = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
  return {
    revenue: num(rec["revenue"]),
    income: num(rec["income"]),
    kubun: num(rec["kubun"]),
    pensionRevenue: num(rec["pensionRevenue"]),
    pensionOver65: rec["pensionOver65"] === true,
    businessRevenue: num(rec["businessRevenue"]),
    businessIncome: num(rec["businessIncome"]),
    businessKubun: num(rec["businessKubun"]),
  };
}

/** 給与所得の引数を入力形式に変換する。未指定・不正なら空。 */
export function salaryIncomeArg(args: Record<string, unknown>): SalaryIncomeInput {
  const raw = args["salary_income"];
  if (typeof raw !== "object" || raw === null) return EMPTY_SALARY_INCOME;
  const rec = raw as Record<string, unknown>;
  return {
    revenue: typeof rec["revenue"] === "number" && Number.isFinite(rec["revenue"])
      ? Math.trunc(rec["revenue"])
      : 0,
    adjustmentEligible: rec["adjustmentEligible"] === true,
  };
}

/** 今日の日付（日本時間、YYYY-MM-DD）。 */
export function todayInTokyo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/** 値を JSON テキスト1件のツール結果にする。 */
export function textResult(value: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** 年度引数の検証（REST の year 検証と同じ範囲）。 */
export function yearArg(args: Record<string, unknown>, key = "year"): number {
  const year = Number(args[key]);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error(`${key} が不正です`);
  }
  return year;
}

/** ID 引数の検証（正の整数）。 */
export function idArg(args: Record<string, unknown>, key: string): number {
  const id = Number(args[key]);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${key} は正の整数で渡してください`);
  }
  return id;
}
