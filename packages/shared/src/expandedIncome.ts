/**
 * expandedIncome.ts — 配当・一時・株式等譲渡所得の入力と決定的計算。
 * 帳簿（事業・不動産）・給与・雑に載らない
 * 所得区分を、申告入力から所得税計算・XTX（第一表・第三表・
 * 株式等計算明細書）まで一貫させるための純粋関数群。
 *
 * 一時所得（第一表で完結）
 *   一時所得の金額 = 総収入金額 − 支出金額 − 特別控除（最高50万円）、
 *   その1/2を総所得金額に算入する（国税庁タックスアンサー No.1490）。
 *   1/2算入額の円未満は切り捨てる（申告書の金額は円単位のため）。
 * 配当所得（総合課税）＋配当控除
 *   配当所得の金額 = 収入金額 − 株式等を取得するための負債の利子
 *   （No.1330）。上場株式等の配当は総合課税／申告分離課税／申告不要を
 *   選択でき、申告分離の選択は申告する上場配当の全額について行う。
 *   一般株式等（非上場）の配当は総合課税のみ。配当控除は総合課税で
 *   申告した配当のみが対象（No.1250、計算は deductions.dividendCredit）。
 *   所得税と住民税で異なる課税方式の選択は令和6年度分以降できない
 *   ため、方式は1つだけを持つ（No.1474 等）。
 * 株式等譲渡（申告分離課税）＋配当の申告分離・損益通算
 *   株式等は申告分離課税 20.315%（所得税等15.315%＋住民税5%、No.1463）。
 *   上場株式等と一般株式等は別区分で、相互に損益通算できない。
 *   上場株式等の譲渡損失は、同年の申告分離課税の上場配当等と
 *   損益通算できる（No.1474）。残った損失の翌年以後への繰越控除は
 *   扱わないため、金額を参考値として返すだけにし、申告データには混ぜない。
 *   特定口座（源泉徴収あり）は口座ごとに申告不要を選択できる
 *   （No.1476）。申告する口座だけを specialAccounts に入れ、申告しない
 *   口座は入力自体に含めない（＝申告データに混ざらない）。
 *
 * 対象外（入力欄自体を持たない）:
 *   上場株式等の譲渡損失の繰越控除（専用付表）、土地建物等の譲渡、
 *   退職所得、山林所得、先物取引、総合譲渡。
 *
 * 負債の利子の配分: 総合分と申告分離分の両方に配当がある場合、
 * 負債の利子は収入金額の比で按分する（分離分を切り捨て、残りを
 * 総合分に寄せる決定的ルール）。片方しかなければ全額がそちらに付く。
 */
import { taxParametersFor } from "./taxParameters";
import type { TaxCreditInputs } from "./deductions";
import { toNonNegativeInteger as amount, toInteger as signed } from "./inputValues";

// ---------------------------------------------------------------------------
// 一時所得
// ---------------------------------------------------------------------------

/** 一時所得の特別控除の上限（No.1490）。 */
export const TEMP_INCOME_SPECIAL_DEDUCTION = 500_000;

export interface TempIncomeInput {
  /** 総収入金額（第一表「サ」） */
  revenue: number;
  /** 収入を得るために支出した金額 */
  expenses: number;
}

export const EMPTY_TEMP_INCOME: TempIncomeInput = { revenue: 0, expenses: 0 };

export interface TempIncomeBreakdown {
  revenue: number;
  expenses: number;
  /** 特別控除の適用額（上限50万円。差引金額が上限） */
  specialDeduction: number;
  /** 一時所得の金額（第一表⑫。0未満にはならない） */
  amount: number;
  /** 総所得金額に算入する額（金額の1/2、円未満切捨て） */
  includedAmount: number;
}

/**
 * 総所得金額（総合課税分）を求める。ordinaryIncome は経常所得（事業・不動産・
 * 給与・雑・配当などの合計。事業・不動産の損失を含む符号つき）、
 * tempIncomeAmount は一時所得の金額（特別控除後、computeTempIncome の amount）。
 * 経常所得の損失は一時所得と通算し、その後の一時所得を1/2にする
 * （所得税法22条2項2号・同法施行令198条）。引き切れない損失は負のまま返す。
 */
export function comprehensiveTotalIncome(ordinaryIncome: number, tempIncomeAmount: number): number {
  const ordinary = signed(ordinaryIncome);
  const temp = amount(tempIncomeAmount);
  if (ordinary >= 0) return ordinary + Math.floor(temp / 2);
  const tempAfterOffset = temp + ordinary;
  return tempAfterOffset >= 0 ? Math.floor(tempAfterOffset / 2) : tempAfterOffset;
}

/** 一時所得の金額と1/2算入額を計算する。 */
export function computeTempIncome(input: TempIncomeInput): TempIncomeBreakdown {
  const revenue = amount(input.revenue);
  const expenses = amount(input.expenses);
  const balance = Math.max(revenue - expenses, 0);
  const specialDeduction = Math.min(balance, TEMP_INCOME_SPECIAL_DEDUCTION);
  const amt = balance - specialDeduction;
  return {
    revenue,
    expenses,
    specialDeduction,
    amount: amt,
    includedAmount: Math.floor(amt / 2),
  };
}

// ---------------------------------------------------------------------------
// 配当所得
// ---------------------------------------------------------------------------

/** 上場株式等の配当等の課税方式。申告する上場配当の全額に適用される。 */
export type ListedDividendMode = "comprehensive" | "separate" | "none";

export interface DividendIncomeInput {
  /** 上場株式等の配当等の収入金額 */
  listedRevenue: number;
  /** 上場分のうち証券投資信託の収益の分配（配当控除は5%区分） */
  listedTrustRevenue: number;
  /** 一般株式等（非上場）の配当等の収入金額（総合課税のみ） */
  generalRevenue: number;
  /** 一般分のうち証券投資信託の収益の分配 */
  generalTrustRevenue: number;
  /** 株式等を取得するための負債の利子（配当所得全体の必要経費） */
  interestExpense: number;
  /** 上場分の課税方式（総合／申告分離／申告不要） */
  listedMode: ListedDividendMode;
  /** 上場分の源泉徴収税額（所得税等分。支払通知書の所得税額） */
  listedWithholding: number;
  /** 一般分の源泉徴収税額（所得税等分） */
  generalWithholding: number;
}

export const EMPTY_DIVIDEND_INCOME: DividendIncomeInput = {
  listedRevenue: 0,
  listedTrustRevenue: 0,
  generalRevenue: 0,
  generalTrustRevenue: 0,
  interestExpense: 0,
  listedMode: "comprehensive",
  listedWithholding: 0,
  generalWithholding: 0,
};

export interface DividendIncomeBreakdown {
  /** 上場配当等の課税方式（入力の選択） */
  listedMode: ListedDividendMode;
  /** 総合課税分の収入金額（一般＋総合選択した上場） */
  comprehensiveRevenue: number;
  /** 申告分離課税分の収入金額（上場のみ） */
  separateRevenue: number;
  /** 負債の利子のうち総合分への配分額 */
  interestComprehensive: number;
  /** 負債の利子のうち申告分離分への配分額 */
  interestSeparate: number;
  /** 配当所得の金額（総合課税分。赤字は符号つきで返すが、他の所得とは通算しない） */
  comprehensiveIncome: number;
  /** 配当所得の金額（申告分離分、損益通算前。赤字は符号つき） */
  separateIncome: number;
  /** 配当控除の対象額（剰余金の配当等。総合課税分の所得金額ベース） */
  creditCorporate: number;
  /** 配当控除の対象額（証券投資信託の収益の分配。総合課税分） */
  creditTrust: number;
  /** 申告する配当の源泉徴収税額（所得税等分）の合計 */
  withholding: number;
}

/** 配当所得の総合分・申告分離分と、配当控除の対象額を計算する。 */
export function computeDividendIncome(input: DividendIncomeInput): DividendIncomeBreakdown {
  const listedRevenue = amount(input.listedRevenue);
  const generalRevenue = amount(input.generalRevenue);
  const listedTrust = Math.min(amount(input.listedTrustRevenue), listedRevenue);
  const generalTrust = Math.min(amount(input.generalTrustRevenue), generalRevenue);
  const interest = amount(input.interestExpense);

  const comprehensiveRevenue =
    generalRevenue + (input.listedMode === "comprehensive" ? listedRevenue : 0);
  const separateRevenue = input.listedMode === "separate" ? listedRevenue : 0;
  const totalRevenue = comprehensiveRevenue + separateRevenue;

  // 負債の利子は収入金額の比で按分する（分離分は切り捨て、残りは総合分）。
  let interestSeparate = 0;
  if (totalRevenue > 0 && separateRevenue > 0) {
    interestSeparate = Math.floor((interest * separateRevenue) / totalRevenue);
  }
  const interestComprehensive = interest - interestSeparate;

  const comprehensiveIncome = comprehensiveRevenue - interestComprehensive;
  const separateIncome = separateRevenue - interestSeparate;

  // 配当控除の対象額は、総合課税分の配当所得の金額を剰余金配当等と
  // 証券投資信託分に収入金額比で按分した額（所得が0以下のときは対象なし）。
  const trustRevenueComprehensive =
    generalTrust + (input.listedMode === "comprehensive" ? listedTrust : 0);
  let creditCorporate = 0;
  let creditTrust = 0;
  if (comprehensiveIncome > 0 && comprehensiveRevenue > 0) {
    creditTrust = Math.floor(
      (comprehensiveIncome * trustRevenueComprehensive) / comprehensiveRevenue,
    );
    creditCorporate = comprehensiveIncome - creditTrust;
  }

  const withholding =
    (input.listedMode === "none" ? 0 : amount(input.listedWithholding)) +
    amount(input.generalWithholding);

  return {
    listedMode: input.listedMode,
    comprehensiveRevenue,
    separateRevenue,
    interestComprehensive,
    interestSeparate,
    comprehensiveIncome,
    separateIncome,
    creditCorporate,
    creditTrust,
    withholding,
  };
}

// ---------------------------------------------------------------------------
// 株式等譲渡
// ---------------------------------------------------------------------------

/** 株式等の譲渡1区分（一般／上場）の金額入力。 */
export interface StockTransferCategoryInput {
  /** 譲渡による収入金額 */
  revenue: number;
  /** その他の収入（償還差益など） */
  otherRevenue: number;
  /** 取得費（取得価額） */
  acquisitionCost: number;
  /** 譲渡のための委託手数料 */
  transferFees: number;
  /** その他の費用 */
  otherExpenses: number;
}

export const EMPTY_STOCK_CATEGORY: StockTransferCategoryInput = {
  revenue: 0,
  otherRevenue: 0,
  acquisitionCost: 0,
  transferFees: 0,
  otherExpenses: 0,
};

/**
 * 申告する特定口座の明細（株式等計算明細書2面の1行）。
 * 特定口座年間取引報告書の値をそのまま入れる。申告不要を選択した
 * 口座はここに入れない（申告データに混ざらない）。
 */
export interface SpecialAccountInput {
  /** 取引先（証券会社等）の名称 */
  brokerName: string;
  /** 支店名。なければ空文字 */
  branchName: string;
  /** 源泉徴収口座（源泉徴収あり）か */
  withholdingAccount: boolean;
  /** 譲渡の対価の額 */
  revenue: number;
  /** 取得費及び譲渡に要した費用の額等 */
  cost: number;
  /** 源泉徴収税額（所得税等分） */
  withholding: number;
}

export interface StockTransferInput {
  /** 一般株式等（特定口座の対象外） */
  general: StockTransferCategoryInput;
  /** 上場株式等（特定口座以外で譲渡した分） */
  listed: StockTransferCategoryInput;
  /** 上場株式等（特定口座以外分）の源泉徴収税額（所得税等分） */
  listedWithholding: number;
  /** 申告する特定口座の明細（上場株式等に合算される） */
  specialAccounts: SpecialAccountInput[];
}

export interface StockCategoryBreakdown extends StockTransferCategoryInput {
  /** 収入金額の小計（譲渡＋その他） */
  revenueTotal: number;
  /** 必要経費の小計（取得費＋手数料＋その他費用） */
  costTotal: number;
  /** 所得金額（差引金額。赤字は符号つきで返す） */
  income: number;
}

function computeStockCategory(input: StockTransferCategoryInput): StockCategoryBreakdown {
  const c: StockTransferCategoryInput = {
    revenue: amount(input.revenue),
    otherRevenue: amount(input.otherRevenue),
    acquisitionCost: amount(input.acquisitionCost),
    transferFees: amount(input.transferFees),
    otherExpenses: amount(input.otherExpenses),
  };
  const revenueTotal = c.revenue + c.otherRevenue;
  const costTotal = c.acquisitionCost + c.transferFees + c.otherExpenses;
  return { ...c, revenueTotal, costTotal, income: revenueTotal - costTotal };
}

export interface StockTransferBreakdown {
  general: StockCategoryBreakdown;
  /** 上場株式等（特定口座以外分＋申告する特定口座分の合算） */
  listed: StockCategoryBreakdown;
  /** 申告する特定口座分の合計（収入金額・費用・源泉徴収税額） */
  specialAccountsTotal: { revenue: number; cost: number; withholding: number; count: number };
  /** 株式等譲渡に係る源泉徴収税額（所得税等分）の合計 */
  withholding: number;
}

/** 株式等譲渡の区分ごとの所得金額を計算する（特定口座分は上場に合算）。 */
export function computeStockTransfer(input: StockTransferInput): StockTransferBreakdown {
  const general = computeStockCategory(input.general);
  const listedDirect = computeStockCategory(input.listed);
  let specialRevenue = 0;
  let specialCost = 0;
  let specialWithholding = 0;
  for (const account of input.specialAccounts) {
    specialRevenue += amount(account.revenue);
    specialCost += amount(account.cost);
    specialWithholding += amount(account.withholding);
  }
  const listed: StockCategoryBreakdown = {
    revenue: listedDirect.revenue + specialRevenue,
    otherRevenue: listedDirect.otherRevenue,
    acquisitionCost: listedDirect.acquisitionCost + specialCost,
    transferFees: listedDirect.transferFees,
    otherExpenses: listedDirect.otherExpenses,
    revenueTotal: listedDirect.revenueTotal + specialRevenue,
    costTotal: listedDirect.costTotal + specialCost,
    income: listedDirect.income + (specialRevenue - specialCost),
  };
  return {
    general,
    listed,
    specialAccountsTotal: {
      revenue: specialRevenue,
      cost: specialCost,
      withholding: specialWithholding,
      count: input.specialAccounts.length,
    },
    withholding: amount(input.listedWithholding) + specialWithholding,
  };
}

// ---------------------------------------------------------------------------
// 拡張所得全体（合算と損益通算）
// ---------------------------------------------------------------------------

export interface ExpandedIncomeInput {
  temp: TempIncomeInput;
  dividend: DividendIncomeInput;
  stocks: StockTransferInput;
}

export const EMPTY_EXPANDED_INCOME: ExpandedIncomeInput = {
  temp: { ...EMPTY_TEMP_INCOME },
  dividend: { ...EMPTY_DIVIDEND_INCOME },
  stocks: {
    general: { ...EMPTY_STOCK_CATEGORY },
    listed: { ...EMPTY_STOCK_CATEGORY },
    listedWithholding: 0,
    specialAccounts: [],
  },
};

export interface ExpandedIncomeBreakdown {
  temp: TempIncomeBreakdown;
  dividend: DividendIncomeBreakdown;
  stocks: StockTransferBreakdown;
  /** 配当の入力（収入金額・負債の利子のいずれか）があったか */
  dividendDeclared: boolean;
  /** 総合課税の総所得金額へ加算する額（配当（総合。赤字は 0）＋一時1/2算入額） */
  comprehensiveAddition: number;
  /**
   * 上場株式等の譲渡損失のうち、申告分離の上場配当等へ通算した額。
   * 上場株式等の譲渡損失は一般株式等・総合課税の所得とは通算できない。
   */
  listedLossOffsetToDividend: number;
  /** 損益通算後の申告分離の上場配当等の所得金額（0以上） */
  separateDividendIncome: number;
  /**
   * 申告分離課税の対象になる株式等譲渡所得（所得控除の配分前、0以上）。
   * 一般・上場とも黒字分のみ（赤字区分は切り捨て、相互通算しない）。
   */
  separateStockIncome: number;
  /**
   * 損益通算しても残った上場株式等の譲渡損失（参考値）。
   * 翌年以後への繰越控除は扱わず、本計算には使わない。
   */
  unabsorbedListedLoss: number;
  /** 合計所得金額へ加算する申告分離分（株式等＋配当、損益通算後） */
  separateIncomeTotal: number;
  /** 申告する配当・株式等の源泉徴収税額（所得税等分）の合計 */
  withholding: number;
  /** 申告分離課税の対象（第三表が必要）かどうか */
  hasSeparateTaxation: boolean;
  /** 株式等譲渡の申告（第三表・計算明細書が必要）かどうか */
  hasStockTransfer: boolean;
}

/** 拡張所得全体を計算し、損益通算まで済ませた内訳を返す。 */
export function computeExpandedIncomes(input: ExpandedIncomeInput): ExpandedIncomeBreakdown {
  const temp = computeTempIncome(input.temp);
  const dividend = computeDividendIncome(input.dividend);
  const stocks = computeStockTransfer(input.stocks);

  // 上場株式等の譲渡損失は、申告分離の上場配当等と損益通算できる
  // （No.1474）。配当側が赤字の場合は通算しない（損失はそのまま残る）。
  const listedLoss = Math.max(-stocks.listed.income, 0);
  const offset = Math.min(listedLoss, Math.max(dividend.separateIncome, 0));
  const separateDividendIncome = Math.max(dividend.separateIncome - offset, 0);
  const unabsorbedListedLoss = listedLoss - offset;

  const separateStockIncome =
    Math.max(stocks.general.income, 0) + Math.max(stocks.listed.income, 0);

  const hasStockTransfer =
    stocks.general.revenueTotal > 0 ||
    stocks.general.costTotal > 0 ||
    stocks.listed.revenueTotal > 0 ||
    stocks.listed.costTotal > 0;
  const hasSeparateTaxation =
    hasStockTransfer || dividend.separateRevenue > 0 || dividend.separateIncome !== 0;

  const dividendDeclared =
    amount(input.dividend.listedRevenue) +
      amount(input.dividend.listedTrustRevenue) +
      amount(input.dividend.generalRevenue) +
      amount(input.dividend.generalTrustRevenue) +
      amount(input.dividend.interestExpense) >
    0;

  return {
    temp,
    dividend,
    stocks,
    dividendDeclared,
    // 配当所得の赤字は損益通算の対象外（所得税法69条）
    comprehensiveAddition: Math.max(dividend.comprehensiveIncome, 0) + temp.includedAmount,
    listedLossOffsetToDividend: offset,
    separateDividendIncome,
    separateStockIncome,
    unabsorbedListedLoss,
    separateIncomeTotal: separateStockIncome + separateDividendIncome,
    withholding: dividend.withholding + stocks.withholding,
    hasSeparateTaxation,
    hasStockTransfer,
  };
}

/**
 * 分離課税の所得税額（1区分分）。課税所得金額 × 年度パラメータの税率で、
 * 円未満は切り捨てる。住民税分（5%）は確定申告の計算対象外。
 */
export function separateTaxAmount(year: number, kind: "stocks" | "listedDividend", taxable: number): number {
  const params = taxParametersFor(year);
  const rate = kind === "stocks" ? params.stockSeparateTaxRate : params.listedDividendSeparateTaxRate;
  const t = amount(taxable);
  return Math.floor(t * rate + 1e-9);
}

/**
 * 配当の入力がある場合、税額控除の入力のうち配当控除の対象額
 * （dividendCorporate / dividendTrust）を配当所得の内訳から導出した額で
 * 置き換える。配当パネルと税額控除パネルの両方から配当控除が効く
 * 二重適用を防ぐための単一の情報源。配当の入力がなければ元のまま返す。
 */
export function resolveTaxCreditInputs(
  base: TaxCreditInputs,
  expanded: ExpandedIncomeBreakdown,
): TaxCreditInputs {
  if (!expanded.dividendDeclared) return base;
  return {
    ...base,
    dividendCorporate: expanded.dividend.creditCorporate,
    dividendTrust: expanded.dividend.creditTrust,
  };
}

/** 拡張所得分の源泉徴収税額の合計（申告する配当＋株式等譲渡分）。 */
export function expandedWithholdingTotal(expanded: ExpandedIncomeBreakdown): number {
  return expanded.dividend.withholding + expanded.stocks.withholding;
}

// ---------------------------------------------------------------------------
// 入力の正規化（API の任意項目などを完全な入力へ寄せる）
// ---------------------------------------------------------------------------

function normalizeStockCategory(
  partial: Partial<StockTransferCategoryInput> | undefined,
): StockTransferCategoryInput {
  if (!partial) return { ...EMPTY_STOCK_CATEGORY };
  return {
    revenue: signed(partial.revenue ?? 0),
    otherRevenue: signed(partial.otherRevenue ?? 0),
    acquisitionCost: signed(partial.acquisitionCost ?? 0),
    transferFees: signed(partial.transferFees ?? 0),
    otherExpenses: signed(partial.otherExpenses ?? 0),
  };
}

function normalizeSpecialAccount(
  partial: Partial<SpecialAccountInput> | undefined,
): SpecialAccountInput {
  if (!partial) {
    return { brokerName: "", branchName: "", withholdingAccount: true, revenue: 0, cost: 0, withholding: 0 };
  }
  return {
    brokerName: typeof partial.brokerName === "string" ? partial.brokerName : "",
    branchName: typeof partial.branchName === "string" ? partial.branchName : "",
    withholdingAccount: partial.withholdingAccount !== false,
    revenue: signed(partial.revenue ?? 0),
    cost: signed(partial.cost ?? 0),
    withholding: signed(partial.withholding ?? 0),
  };
}

/** 部分的な拡張所得入力を完全な入力へ寄せる（欠けた区分は空として扱う）。 */
export function normalizeExpandedIncomeInput(
  partial: Partial<ExpandedIncomeInput> | undefined,
): ExpandedIncomeInput {
  if (!partial) {
    return {
      temp: { ...EMPTY_TEMP_INCOME },
      dividend: { ...EMPTY_DIVIDEND_INCOME },
      stocks: {
        general: { ...EMPTY_STOCK_CATEGORY },
        listed: { ...EMPTY_STOCK_CATEGORY },
        listedWithholding: 0,
        specialAccounts: [],
      },
    };
  }
  const mode = partial.dividend?.listedMode;
  return {
    temp: {
      revenue: signed(partial.temp?.revenue ?? 0),
      expenses: signed(partial.temp?.expenses ?? 0),
    },
    dividend: {
      listedRevenue: signed(partial.dividend?.listedRevenue ?? 0),
      listedTrustRevenue: signed(partial.dividend?.listedTrustRevenue ?? 0),
      generalRevenue: signed(partial.dividend?.generalRevenue ?? 0),
      generalTrustRevenue: signed(partial.dividend?.generalTrustRevenue ?? 0),
      interestExpense: signed(partial.dividend?.interestExpense ?? 0),
      listedMode: mode === "separate" || mode === "none" ? mode : "comprehensive",
      listedWithholding: signed(partial.dividend?.listedWithholding ?? 0),
      generalWithholding: signed(partial.dividend?.generalWithholding ?? 0),
    },
    stocks: {
      general: normalizeStockCategory(partial.stocks?.general),
      listed: normalizeStockCategory(partial.stocks?.listed),
      listedWithholding: signed(partial.stocks?.listedWithholding ?? 0),
      specialAccounts: Array.isArray(partial.stocks?.specialAccounts)
        ? partial.stocks.specialAccounts.map((a) => normalizeSpecialAccount(a))
        : [],
    },
  };
}

/** 拡張所得の入力がすべて空（申告対象なし）かどうか。 */
export function isExpandedIncomeEmpty(input: ExpandedIncomeInput): boolean {
  const b = computeExpandedIncomes(input);
  return (
    b.temp.revenue === 0 &&
    b.temp.expenses === 0 &&
    b.dividend.comprehensiveRevenue === 0 &&
    b.dividend.separateRevenue === 0 &&
    !b.hasStockTransfer &&
    input.stocks.specialAccounts.length === 0
  );
}

// ---------------------------------------------------------------------------
// ワイヤ形式（snake_case）との変換。API の export 系リクエストで使う。
// ---------------------------------------------------------------------------

export interface ExpandedIncomeWire {
  temp: { revenue: number; expenses: number };
  dividend: {
    listed_revenue: number;
    listed_trust_revenue: number;
    general_revenue: number;
    general_trust_revenue: number;
    interest_expense: number;
    listed_mode: ListedDividendMode;
    listed_withholding: number;
    general_withholding: number;
  };
  stocks: {
    general: {
      revenue: number;
      other_revenue: number;
      acquisition_cost: number;
      transfer_fees: number;
      other_expenses: number;
    };
    listed: {
      revenue: number;
      other_revenue: number;
      acquisition_cost: number;
      transfer_fees: number;
      other_expenses: number;
    };
    listed_withholding: number;
    special_accounts: {
      broker_name: string;
      branch_name: string;
      withholding_account: boolean;
      revenue: number;
      cost: number;
      withholding: number;
    }[];
  };
}

/** ドメイン形式の拡張所得入力をワイヤ形式（snake_case）へ変換する。 */
export function expandedIncomeToWire(input: ExpandedIncomeInput): ExpandedIncomeWire {
  const category = (c: StockTransferCategoryInput) => ({
    revenue: c.revenue,
    other_revenue: c.otherRevenue,
    acquisition_cost: c.acquisitionCost,
    transfer_fees: c.transferFees,
    other_expenses: c.otherExpenses,
  });
  return {
    temp: { revenue: input.temp.revenue, expenses: input.temp.expenses },
    dividend: {
      listed_revenue: input.dividend.listedRevenue,
      listed_trust_revenue: input.dividend.listedTrustRevenue,
      general_revenue: input.dividend.generalRevenue,
      general_trust_revenue: input.dividend.generalTrustRevenue,
      interest_expense: input.dividend.interestExpense,
      listed_mode: input.dividend.listedMode,
      listed_withholding: input.dividend.listedWithholding,
      general_withholding: input.dividend.generalWithholding,
    },
    stocks: {
      general: category(input.stocks.general),
      listed: category(input.stocks.listed),
      listed_withholding: input.stocks.listedWithholding,
      special_accounts: input.stocks.specialAccounts.map((a) => ({
        broker_name: a.brokerName,
        branch_name: a.branchName,
        withholding_account: a.withholdingAccount,
        revenue: a.revenue,
        cost: a.cost,
        withholding: a.withholding,
      })),
    },
  };
}

/** ワイヤ形式（snake_case）の拡張所得入力をドメイン形式へ変換する。 */
export function expandedIncomeFromWire(wire: ExpandedIncomeWire): ExpandedIncomeInput {
  const category = (c: ExpandedIncomeWire["stocks"]["general"]): StockTransferCategoryInput => ({
    revenue: c.revenue,
    otherRevenue: c.other_revenue,
    acquisitionCost: c.acquisition_cost,
    transferFees: c.transfer_fees,
    otherExpenses: c.other_expenses,
  });
  return normalizeExpandedIncomeInput({
    temp: { revenue: wire.temp.revenue, expenses: wire.temp.expenses },
    dividend: {
      listedRevenue: wire.dividend.listed_revenue,
      listedTrustRevenue: wire.dividend.listed_trust_revenue,
      generalRevenue: wire.dividend.general_revenue,
      generalTrustRevenue: wire.dividend.general_trust_revenue,
      interestExpense: wire.dividend.interest_expense,
      listedMode: wire.dividend.listed_mode,
      listedWithholding: wire.dividend.listed_withholding,
      generalWithholding: wire.dividend.general_withholding,
    },
    stocks: {
      general: category(wire.stocks.general),
      listed: category(wire.stocks.listed),
      listedWithholding: wire.stocks.listed_withholding,
      specialAccounts: wire.stocks.special_accounts.map((a) => ({
        brokerName: a.broker_name,
        branchName: a.branch_name,
        withholdingAccount: a.withholding_account,
        revenue: a.revenue,
        cost: a.cost,
        withholding: a.withholding,
      })),
    },
  });
}
