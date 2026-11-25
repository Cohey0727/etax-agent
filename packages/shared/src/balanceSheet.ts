/**
 * balanceSheet.ts — 貸借対照表（KOA210 4面）入力の共通ヘルパー。
 *
 * 貸借対照表の入力値は申告入力（filing_inputs）の年度別 state に
 * XtxBalanceSheetInput の形（ドメイン形式）で保存するのが正で、
 * API のワイヤ形式（snake_case）への変換は balanceSheetToWire の
 * 一箇所だけが行う（二重管理にしない）。
 * 合計と貸借一致の算出は trialBalance.ts の buildTrialBalanceSheet が担い、
 * ここは入力値そのものの整形・判定・繰越だけを持つ。
 */
import {
  BS_ASSET_ACCOUNTS,
  BS_LIABILITY_ACCOUNTS,
  type BalanceSheetAccount,
  type XtxBalanceSheetInput,
} from "./xtx";

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 自由追加する1行（その他の資産・負債）。ワイヤ形式も同じ形。 */
export interface BalanceSheetWireExtra {
  name: string;
  opening: number;
  closing: number;
}

/**
 * 貸借対照表入力のAPIワイヤ形式（サーバーの BalanceSheetInput スキーマと
 * 同じ形）。ドメイン形式（XtxBalanceSheetInput）とは追加行と事業主貸借の
 * キー名だけが違う。
 */
export interface BalanceSheetWireInput {
  opening: Partial<Record<BalanceSheetAccount, number>>;
  closing: Partial<Record<BalanceSheetAccount, number>>;
  extra_asset?: BalanceSheetWireExtra;
  extra_liability1?: BalanceSheetWireExtra;
  extra_liability2?: BalanceSheetWireExtra;
  owner_loan: number;
  owner_borrowing: number;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 貸借対照表の全勘定キー（資産・負債・貸倒引当金・元入金）。 */
export const BALANCE_SHEET_ACCOUNTS: readonly BalanceSheetAccount[] = [
  ...BS_ASSET_ACCOUNTS.map(([key]) => key),
  ...BS_LIABILITY_ACCOUNTS.map(([key]) => key),
  "allowance_for_doubtful_accounts",
  "capital",
];

const ACCOUNT_SET: ReadonlySet<string> = new Set(BALANCE_SHEET_ACCOUNTS);

// ---------------------------------------------------------------------------
// 生成・判定
// ---------------------------------------------------------------------------

/** 空の貸借対照表入力（金額は未入力＝0として扱う）。 */
export function emptyBalanceSheetInput(): XtxBalanceSheetInput {
  return { opening: {}, closing: {}, ownerLoan: 0, ownerBorrowing: 0 };
}

/**
 * 実質的に未入力かどうか。全額0で追加行の名称も無ければ、試算表や
 * XTXへ貸借対照表を渡す意味がないため「入力なし」として扱う。
 */
export function isBalanceSheetEmpty(input: XtxBalanceSheetInput): boolean {
  const recordEmpty = (record: Partial<Record<BalanceSheetAccount, number>>): boolean =>
    Object.values(record).every((value) => !value);
  const extraEmpty = (extra?: BalanceSheetWireExtra): boolean =>
    !extra || (!extra.opening && !extra.closing && extra.name.trim() === "");
  return (
    recordEmpty(input.opening) &&
    recordEmpty(input.closing) &&
    extraEmpty(input.extraAsset) &&
    extraEmpty(input.extraLiability1) &&
    extraEmpty(input.extraLiability2) &&
    !input.ownerLoan &&
    !input.ownerBorrowing
  );
}

// ---------------------------------------------------------------------------
// 正規化（保存値の読み込み用）
// ---------------------------------------------------------------------------

function sanitizeAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function sanitizeRecord(raw: unknown): Partial<Record<BalanceSheetAccount, number>> {
  if (typeof raw !== "object" || raw === null) return {};
  const record: Partial<Record<BalanceSheetAccount, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ACCOUNT_SET.has(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    record[key as BalanceSheetAccount] = Math.trunc(value);
  }
  return record;
}

function sanitizeExtra(raw: unknown): BalanceSheetWireExtra | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const extra = raw as Partial<BalanceSheetWireExtra>;
  return {
    name: typeof extra.name === "string" ? extra.name : "",
    opening: sanitizeAmount(extra.opening),
    closing: sanitizeAmount(extra.closing),
  };
}

/**
 * 保存済みの貸借対照表入力を検証して取り出す。壊れた値は捨て、
 * 形を満たさなければ null（未入力）を返す。期末の元入金は
 * 期首元入金から計算される様式のため保持しない。
 */
export function normalizeBalanceSheetInput(raw: unknown): XtxBalanceSheetInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Partial<XtxBalanceSheetInput>;
  const closing = sanitizeRecord(value.closing);
  delete closing.capital;
  return {
    opening: sanitizeRecord(value.opening),
    closing,
    extraAsset: sanitizeExtra(value.extraAsset),
    extraLiability1: sanitizeExtra(value.extraLiability1),
    extraLiability2: sanitizeExtra(value.extraLiability2),
    ownerLoan: sanitizeAmount(value.ownerLoan),
    ownerBorrowing: sanitizeAmount(value.ownerBorrowing),
  };
}

// ---------------------------------------------------------------------------
// 前年繰越
// ---------------------------------------------------------------------------

/**
 * 前年の期末残高を当期の期首として取り込む（繰越の提案を適用した
 * 新しい入力を返す）。元入金は個人事業の繰越計算どおり
 * 「前年の期首元入金 + 前年の所得（青色申告特別控除前）+ 事業主借
 * − 事業主貸」とするため、前年が貸借一致していれば繰越後の期首も
 * 自動で貸借一致する。期末側は当期の入力を保持し、事業主貸・事業主借は
 * 期末専用の項目なので当期分を使う。
 */
export function carryOverBalanceSheet(
  previous: XtxBalanceSheetInput,
  current?: XtxBalanceSheetInput | null,
  previousIncomeBeforeBlue = 0,
): XtxBalanceSheetInput {
  const opening: Partial<Record<BalanceSheetAccount, number>> = { ...previous.closing };
  delete opening.capital;
  opening.capital =
    (previous.opening.capital ?? 0) +
    previousIncomeBeforeBlue +
    previous.ownerBorrowing -
    previous.ownerLoan;
  const carryExtra = (
    prev: BalanceSheetWireExtra | undefined,
    cur: BalanceSheetWireExtra | undefined,
  ): BalanceSheetWireExtra | undefined =>
    prev ? { name: prev.name, opening: prev.closing, closing: cur?.closing ?? 0 } : cur;
  const closing = { ...(current?.closing ?? {}) };
  delete closing.capital;
  return {
    opening,
    closing,
    extraAsset: carryExtra(previous.extraAsset, current?.extraAsset),
    extraLiability1: carryExtra(previous.extraLiability1, current?.extraLiability1),
    extraLiability2: carryExtra(previous.extraLiability2, current?.extraLiability2),
    ownerLoan: current?.ownerLoan ?? 0,
    ownerBorrowing: current?.ownerBorrowing ?? 0,
  };
}

// ---------------------------------------------------------------------------
// ワイヤ形式への変換
// ---------------------------------------------------------------------------

/** 名称も金額も無い追加行は「行なし」として送る（様式に空行を出さない）。 */
function wireExtra(extra: BalanceSheetWireExtra | undefined): BalanceSheetWireExtra | undefined {
  if (!extra) return undefined;
  if (extra.name.trim() === "" && !extra.opening && !extra.closing) return undefined;
  return extra;
}

/** ドメイン形式をAPIのワイヤ形式（snake_case）へ変換する。 */
export function balanceSheetToWire(input: XtxBalanceSheetInput): BalanceSheetWireInput {
  return {
    opening: input.opening,
    closing: input.closing,
    extra_asset: wireExtra(input.extraAsset),
    extra_liability1: wireExtra(input.extraLiability1),
    extra_liability2: wireExtra(input.extraLiability2),
    owner_loan: input.ownerLoan,
    owner_borrowing: input.ownerBorrowing,
  };
}
