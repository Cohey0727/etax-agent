/**
 * xtxInputs.ts — XTX 出力リクエスト（ワイヤ形式）を @etax/shared の計算・
 * XTX ビルダーの入力に詰め替える（services/etax）。
 * 所得税 XTX・申告書 PDF・試算表・MCP が同じ詰め替えを使う。
 */
import {
  AgricultureInput,
  AgricultureStatement,
  AgricultureWire,
  BS_ASSET_ACCOUNTS,
  BS_LIABILITY_ACCOUNTS,
  BalanceSheetAccount,
  DepreciationDetailRow,
  ExpandedIncomeBreakdown,
  ExpandedIncomeInput,
  ExpandedIncomeWire,
  SeparateTaxationAmounts,
  TaxCreditInputs,
  XtxBalanceSheetInput,
  XtxTaxpayer,
  agricultureFromWire,
  computeAgricultureStatement,
  computeExpandedIncomes,
  depreciationDetailRow,
  expandedIncomeFromWire,
  expandedWithholdingTotal,
  isAgricultureEmpty,
  resolveTaxCreditInputs,
} from "@etax/shared";
import { ExportXtxRequest } from "../../schemas/etax";

/** 入力が原因で XTX を組み立てられなかったことを表すエラー（呼び出し側で 400 にする）。 */
export class XtxInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XtxInputError";
  }
}

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
