/**
 * xtxInputs.ts — 所得税の申告書（XTX・紙イメージ PDF）の出力リクエストを、
 * REST のワイヤ形式から @etax/shared の計算・XTX ビルダーの入力に詰め替える
 * （services/etax）。MCP は同じ IncomeTaxReturnRequest を引数から組み立てる。
 */
import {
  BS_ASSET_ACCOUNTS,
  BS_LIABILITY_ACCOUNTS,
  BalanceSheetAccount,
  DepreciationDetailRow,
  IncomeTaxFilingInput,
  XtxBalanceSheetInput,
  XtxTaxpayer,
  agricultureFromWire,
  depreciationDetailRow,
  expandedIncomeFromWire,
  filterYear,
  normalizeMiscIncomeInput,
  normalizeSalaryIncomeInput,
  normalizeTransactions,
} from "@etax/shared";
import { Db } from "../../lib/db";
import { depreciationDetailRowsForYear, listFixedAssetRows } from "../../repositories/fixedAssetRepository";
import { ExportXtxRequest } from "../../schemas/etax";

/** 入力が原因で XTX を組み立てられなかったことを表すエラー（呼び出し側で 400 にする）。 */
export class XtxInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XtxInputError";
  }
}

/** 所得税の申告書（XTX・紙イメージ PDF）の出力に使う入力一式。 */
export interface IncomeTaxReturnRequest {
  /** 帳簿の取引と申告入力（所得税の計算に使う分） */
  filing: IncomeTaxFilingInput;
  amendment: boolean;
  submissionDate: string;
  taxpayer: XtxTaxpayer;
  /** 源泉徴収税額。配当・株式等の分は拡張所得の入力から自動で加える */
  withholdingTax: number;
  prepaidTax: number;
  /** 修正申告: 修正前の第3期分の税額。修正でなければ null */
  originalThirdPeriodTax: number | null;
}

/** 所得税の XTX の出力に使う入力一式（申告書の入力＋減価償却明細・貸借対照表）。 */
export interface IncomeTaxXtxRequest extends IncomeTaxReturnRequest {
  depreciation?: {
    business: DepreciationDetailRow[];
    realEstate: DepreciationDetailRow[];
    agriculture: DepreciationDetailRow[];
  };
  balanceSheet?: XtxBalanceSheetInput;
}

/** REST のワイヤ形式から申告書の出力の入力一式を作る。取引は対象年の分だけを使う。 */
export function incomeTaxReturnFromWire(body: ExportXtxRequest): IncomeTaxReturnRequest {
  return {
    filing: {
      year: body.year,
      transactions: filterYear(normalizeTransactions(body.transactions ?? []), body.year),
      filingType: body.filing_type,
      realEstateBusinessScale: body.real_estate_business_scale,
      agriculture: body.agriculture ? agricultureFromWire(body.agriculture) : undefined,
      salaryIncome: normalizeSalaryIncomeInput(body.salary_income),
      miscIncome: normalizeMiscIncomeInput(body.misc_income),
      expandedIncome: body.expanded_income ? expandedIncomeFromWire(body.expanded_income) : undefined,
      deductions: body.deductions,
      taxCredits: body.tax_credits,
    },
    amendment: body.amendment,
    submissionDate: body.submission_date,
    taxpayer: toTaxpayer(body.taxpayer),
    withholdingTax: body.withholding_tax,
    prepaidTax: body.prepaid_tax,
    originalThirdPeriodTax: body.original_third_period_tax,
  };
}

/**
 * REST のワイヤ形式から XTX の出力の入力一式を作る。償却計算の失敗と、
 * 貸借対照表の不明な勘定キーは XtxInputError にする。
 */
export function incomeTaxXtxRequestFromWire(body: ExportXtxRequest): IncomeTaxXtxRequest {
  const unknownAccounts = unknownBalanceSheetKeys(body);
  if (unknownAccounts.length > 0) {
    throw new XtxInputError(`貸借対照表に不明な勘定があります: ${unknownAccounts.join("、")}`);
  }
  return {
    ...incomeTaxReturnFromWire(body),
    depreciation: depreciationFromWire(body),
    balanceSheet: balanceSheetFromWire(body),
  };
}

/**
 * リクエストの固定資産入力から減価償却明細行（事業・不動産・農業別）を組み立てる。
 * 償却計算が失敗した資産は、どの資産かが分かる XtxInputError にする。
 */
export function depreciationFromWire(
  body: Pick<ExportXtxRequest, "fixed_assets" | "year">,
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
          disposalDate: asset.disposed_date ?? undefined,
        },
        body.year,
        asset.quantity ?? "",
      );
    } catch (e) {
      throw new XtxInputError(
        `固定資産「${asset.name}」の減価償却計算に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!row) continue;
    if (asset.income_type === "real_estate") realEstate.push(row);
    else if (asset.income_type === "agriculture") agriculture.push(row);
    else business.push(row);
  }
  return { business, realEstate, agriculture };
}

/**
 * 固定資産台帳（DB）から対象年の減価償却明細行を組み立てる。その年に償却する
 * 資産が無ければ undefined。償却計算の失敗は XtxInputError にする。
 */
export async function depreciationFromLedger(
  db: Db,
  year: number,
): Promise<IncomeTaxXtxRequest["depreciation"]> {
  const rows = await listFixedAssetRows(db);
  let detail: ReturnType<typeof depreciationDetailRowsForYear>;
  try {
    detail = depreciationDetailRowsForYear(rows, year);
  } catch (e) {
    throw new XtxInputError(
      `固定資産台帳の減価償却計算に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const count = detail.business.length + detail.realEstate.length + detail.agriculture.length;
  return count > 0 ? detail : undefined;
}

const BALANCE_SHEET_ACCOUNTS: ReadonlySet<string> = new Set([
  ...BS_ASSET_ACCOUNTS.map(([account]) => account),
  ...BS_LIABILITY_ACCOUNTS.map(([account]) => account),
  "allowance_for_doubtful_accounts",
  "capital",
]);

function isBalanceSheetAccount(key: string): key is BalanceSheetAccount {
  return BALANCE_SHEET_ACCOUNTS.has(key);
}

/** 勘定キー → 金額のうち、貸借対照表の勘定だけを取り出す。 */
function balanceSheetAmounts(side: Record<string, number>): Partial<Record<BalanceSheetAccount, number>> {
  const amounts: Partial<Record<BalanceSheetAccount, number>> = {};
  for (const [key, value] of Object.entries(side)) {
    if (isBalanceSheetAccount(key)) amounts[key] = value;
  }
  return amounts;
}

/**
 * 貸借対照表入力のうち、勘定として知らないキー。XTX 出力では綴り違いの
 * キーを黙って捨てると「貸借一致しません」という別の原因に見えるため、
 * 生成前にキー名で知らせる。
 */
export function unknownBalanceSheetKeys(body: Pick<ExportXtxRequest, "balance_sheet">): string[] {
  const bs = body.balance_sheet;
  if (!bs) return [];
  return [...Object.keys(bs.opening), ...Object.keys(bs.closing)].filter(
    (key) => !isBalanceSheetAccount(key),
  );
}

/** リクエストの貸借対照表入力を XTX ビルダーの形式へ変換する。 */
export function balanceSheetFromWire(
  body: Pick<ExportXtxRequest, "balance_sheet">,
): XtxBalanceSheetInput | undefined {
  const bs = body.balance_sheet;
  if (!bs) return undefined;
  return {
    opening: balanceSheetAmounts(bs.opening),
    closing: balanceSheetAmounts(bs.closing),
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

/** ワイヤ形式の納税者情報を XTX ビルダーの形式へ変換する。 */
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
