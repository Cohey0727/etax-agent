/**
 * filingInputs.ts — 申告入力（年度別の DeductionState）の形と、保存先に
 * 依存しない操作。
 *
 * DeductionState はサーバーの申告入力（filing_inputs）に年度ごとに
 * そのまま保存される。保存値は画面の版によって項目が欠けていたり
 * 壊れていたりするので、読み出しは必ず parseDeductionState を通し、
 * 欠けた項目は空の入力で補う。端末のキャッシュ・API の読み書きは
 * web / native の各パッケージが持つ。
 */
import { type AgricultureInput, EMPTY_AGRICULTURE_INPUT, normalizeAgricultureInput } from "./agriculture";
import { normalizeBalanceSheetInput } from "./balanceSheet";
import {
  computeIncomeTax,
  computeManualIncomes,
  type DeductionInputs,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  type IncomeTaxResult,
  type ManualIncomeBreakdown,
  type MiscIncomeInput,
  type SalaryIncomeInput,
  type TaxCreditInputs,
} from "./deductions";
import {
  comprehensiveTotalIncome,
  computeExpandedIncomes,
  expandedWithholdingTotal,
  EMPTY_EXPANDED_INCOME,
  type ExpandedIncomeBreakdown,
  type ExpandedIncomeInput,
  normalizeExpandedIncomeInput,
  resolveTaxCreditInputs,
} from "./expandedIncome";
import { filterYear } from "./ledger";
import {
  type ComputeCorrectedFiguresOptions,
  computeCorrectedFigures,
  type CorrectedFigures,
  type FilingType,
} from "./taxcalc";
import { TAX_PARAMETERS } from "./taxParameters";
import type { Transaction } from "./types";
import type { XtxBalanceSheetInput } from "./xtx";
import { summarizeConsumptionTax } from "./xtxShohi";

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/**
 * 内訳の1件（名称と金額）。寄附金・社会保険料・小規模企業共済等・医療費の
 * ように「内訳があって合計が控除の元になる」入力で共有する。
 * 合計は対応する deductions の金額フィールドに同期する。
 */
export interface BreakdownEntry {
  id: string;
  /** 名称（寄附先・保険の種類・医療機関名など） */
  recipient: string;
  amount: number;
}

/** 内訳を持つ控除入力のキー。 */
export type BreakdownEntriesKey = "donations" | "socialInsurance" | "mutualAid" | "medical";

/** 所得税で、申告納税額を求めるときに差し引く納付済みの税額（提出パネルの手入力）。 */
export interface IncomeTaxPaymentInputs {
  /**
   * 源泉徴収税額。配当・株式等譲渡の源泉徴収税額は各所得の入力で持ち、
   * ここには含めない。
   */
  withholdingTax: number;
  /** 予定納税額 */
  prepaidTax: number;
}

/** 消費税申告書の、帳簿の外にある数字の手入力。 */
export interface ConsumptionFilingInputs {
  /** 申告の種類（1 = 確定、3 = 修正確定） */
  filingKind: 1 | 3;
  /** 基準期間の課税売上高（千円）。null は帳簿から求めた値を使う */
  basePeriodSalesThousands: number | null;
  /** 中間納付税額（国税） */
  interimNational: number;
  /** 中間納付譲渡割額（地方） */
  interimLocal: number;
  /** 既確定税額（国税）。修正確定のときだけ使う */
  originalNational: number;
  /** 既確定譲渡割額（地方）。修正確定のときだけ使う */
  originalLocal: number;
}

export interface DeductionState {
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
  /** 雑所得。帳簿に載らない所得の手入力 */
  miscIncome: MiscIncomeInput;
  /** 給与所得。帳簿に載らない給与の手入力（収入金額のみ） */
  salaryIncome: SalaryIncomeInput;
  /** 配当・一時・株式等譲渡の入力 */
  expandedIncome: ExpandedIncomeInput;
  /** 農業所得の入力。帳簿の取引とは混ぜない申告入力 */
  agriculture: AgricultureInput;
  /** 申告の種類（青色申告特別控除の区分） */
  filingType: FilingType;
  /** 不動産貸付けが事業的規模か */
  realEstateBusinessScale: boolean;
  /** 寄附金の内訳 */
  donationEntries: BreakdownEntry[];
  /** 社会保険料の内訳 */
  socialInsuranceEntries: BreakdownEntry[];
  /** 小規模企業共済等掛金の内訳 */
  mutualAidEntries: BreakdownEntry[];
  /** 医療費の内訳 */
  medicalEntries: BreakdownEntry[];
  /**
   * 貸借対照表（青色申告決算書4面）の入力。ドメイン形式
   * （XtxBalanceSheetInput）で保持し、APIへ渡すときだけワイヤ形式へ
   * 変換する。未入力は null。
   */
  balanceSheet: XtxBalanceSheetInput | null;
  /** 所得税の源泉徴収税額・予定納税額 */
  incomeTaxPayments: IncomeTaxPaymentInputs;
  /** 消費税申告書の手入力 */
  consumptionFiling: ConsumptionFilingInputs;
}

/** エージェント（set_deductions ツール）から適用される申告入力の変更分。 */
export interface DeductionPatch {
  /** 控除入力の部分上書き（DeductionInputs の形）。 */
  deductions?: Partial<DeductionInputs>;
  /** 税額控除の入力の部分上書き。 */
  taxCredits?: Partial<TaxCreditInputs>;
  /** 申告の種類。 */
  filingType?: FilingType;
  /** 雑所得の部分上書き。 */
  miscIncome?: Partial<MiscIncomeInput>;
  /** 配当・一時・株式等譲渡の部分上書き（区分ごとに浅くマージ、特定口座の明細は差し替え）。 */
  expandedIncome?: Partial<ExpandedIncomeInput>;
  /** 農業所得の部分上書き（科目別合計は指定があれば差し替え）。 */
  agriculture?: Partial<AgricultureInput>;
  /** 内訳の差し替え（キーごとに全件差し替え、合計は自動同期）。 */
  entries?: Partial<Record<BreakdownEntriesKey, BreakdownEntry[]>>;
}

/** 「控除・計算」を確定した時点の計算結果の控え（金額はすべて円）。 */
export interface FilingSnapshotFigures {
  business_income: number;
  real_estate_income: number;
  misc_income: number;
  total_income: number;
  total_deductions: number;
  taxable_income: number;
  final_tax: number;
}

/** 帳簿と申告入力から求めた、所得と所得税額の一式。 */
export interface FilingFigures {
  /** 帳簿と農業所得の入力から求めた申告数値（収入・経費・青色申告特別控除の配分） */
  corrected: CorrectedFigures;
  /** 給与所得・公的年金等・雑所得 */
  manual: ManualIncomeBreakdown;
  /** 配当・一時・株式等譲渡 */
  expanded: ExpandedIncomeBreakdown;
  /**
   * 合計所得金額（総合課税分）。経常所得（帳簿・給与・雑・配当）の損失を
   * 一時所得と通算してから一時所得を1/2にした額で、損失が残れば負。
   */
  totalIncome: number;
  /**
   * 一時所得が合計所得金額に加えた額（totalIncome − 経常所得）。経常所得が黒字なら
   * 一時所得の金額の1/2、損失があるときは通算した後に1/2にした結果との差。
   */
  tempIncomeAddition: number;
  /** 所得税額の計算結果 */
  taxResult: IncomeTaxResult;
}

// ---------------------------------------------------------------------------
// 空の状態・保存値の復元
// ---------------------------------------------------------------------------

const BREAKDOWN_STATE_FIELDS: Record<
  BreakdownEntriesKey,
  "donationEntries" | "socialInsuranceEntries" | "mutualAidEntries" | "medicalEntries"
> = {
  donations: "donationEntries",
  socialInsurance: "socialInsuranceEntries",
  mutualAid: "mutualAidEntries",
  medical: "medicalEntries",
};

const BREAKDOWN_TOTAL_FIELDS: Record<
  BreakdownEntriesKey,
  "donationsTotal" | "socialInsurancePaid" | "smallBusinessMutualAidPaid" | "medicalExpensesPaid"
> = {
  donations: "donationsTotal",
  socialInsurance: "socialInsurancePaid",
  mutualAid: "smallBusinessMutualAidPaid",
  medical: "medicalExpensesPaid",
};

const FILING_TYPES: readonly FilingType[] = ["blue65", "blue55", "blue10", "white"];

/** 空の入力状態（EMPTY 定数をそのまま共有しないよう複製する）。 */
export function freshDeductionState(): DeductionState {
  return {
    deductions: {
      ...EMPTY_DEDUCTION_INPUTS,
      lifeInsurance: { ...EMPTY_DEDUCTION_INPUTS.lifeInsurance },
      earthquakeInsurance: { ...EMPTY_DEDUCTION_INPUTS.earthquakeInsurance },
      dependents: { ...EMPTY_DEDUCTION_INPUTS.dependents },
      disability: { ...EMPTY_DEDUCTION_INPUTS.disability },
      casualtyLoss: null,
    },
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    miscIncome: { ...EMPTY_MISC_INCOME },
    salaryIncome: { ...EMPTY_SALARY_INCOME },
    expandedIncome: normalizeExpandedIncomeInput(EMPTY_EXPANDED_INCOME),
    agriculture: normalizeAgricultureInput(EMPTY_AGRICULTURE_INPUT),
    filingType: "blue65",
    realEstateBusinessScale: false,
    donationEntries: [],
    socialInsuranceEntries: [],
    mutualAidEntries: [],
    medicalEntries: [],
    balanceSheet: null,
    incomeTaxPayments: { withholdingTax: 0, prepaidTax: 0 },
    consumptionFiling: {
      filingKind: 1,
      basePeriodSalesThousands: null,
      interimNational: 0,
      interimLocal: 0,
      originalNational: 0,
      originalLocal: 0,
    },
  };
}

/** 有限の数値なら整数に切り捨てて返し、それ以外は null。 */
function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** 数値でない項目は 0 にする。 */
function integerOrZero(value: unknown): number {
  return finiteInteger(value) ?? 0;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
}

function parseSalaryIncome(raw: unknown): SalaryIncomeInput {
  const s = asRecord(raw);
  if (!s) return { ...EMPTY_SALARY_INCOME };
  return {
    revenue: integerOrZero(s.revenue),
    adjustmentEligible: s.adjustmentEligible === true,
  };
}

function parseMiscIncome(raw: unknown): MiscIncomeInput {
  const m = asRecord(raw);
  if (!m) return { ...EMPTY_MISC_INCOME };
  return {
    revenue: integerOrZero(m.revenue),
    income: integerOrZero(m.income),
    kubun: integerOrZero(m.kubun),
    pensionRevenue: integerOrZero(m.pensionRevenue),
    pensionOver65: m.pensionOver65 === true,
    businessRevenue: integerOrZero(m.businessRevenue),
    businessIncome: integerOrZero(m.businessIncome),
    businessKubun: integerOrZero(m.businessKubun),
  };
}

/** 保存済みの内訳を検証して取り出す。壊れた要素は捨てる。 */
function parseBreakdownEntries(raw: unknown): BreakdownEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: BreakdownEntry[] = [];
  raw.forEach((item, index) => {
    const e = asRecord(item);
    if (!e) return;
    entries.push({
      id: typeof e.id === "string" && e.id ? e.id : `breakdown-loaded-${index}`,
      recipient: typeof e.recipient === "string" ? e.recipient : "",
      amount: integerOrZero(e.amount),
    });
  });
  return entries;
}

function parseIncomeTaxPayments(raw: unknown): IncomeTaxPaymentInputs {
  const p = asRecord(raw);
  return {
    withholdingTax: integerOrZero(p?.withholdingTax),
    prepaidTax: integerOrZero(p?.prepaidTax),
  };
}

function parseConsumptionFiling(raw: unknown): ConsumptionFilingInputs {
  const c = asRecord(raw);
  return {
    filingKind: c?.filingKind === 3 ? 3 : 1,
    basePeriodSalesThousands: finiteInteger(c?.basePeriodSalesThousands),
    interimNational: integerOrZero(c?.interimNational),
    interimLocal: integerOrZero(c?.interimLocal),
    originalNational: integerOrZero(c?.originalNational),
    originalLocal: integerOrZero(c?.originalLocal),
  };
}

/** パース済みの保存値を検証して DeductionState にする。欠けた項目は空の入力で補う。 */
export function parseDeductionState(parsed: Partial<DeductionState>): DeductionState {
  const base = freshDeductionState();
  const d = (parsed.deductions ?? {}) as Partial<DeductionInputs>;
  const deductions: DeductionInputs = {
    ...base.deductions,
    ...d,
    lifeInsurance: { ...base.deductions.lifeInsurance, ...d.lifeInsurance },
    earthquakeInsurance: { ...base.deductions.earthquakeInsurance, ...d.earthquakeInsurance },
    dependents: { ...base.deductions.dependents, ...d.dependents },
    disability: { ...base.deductions.disability, ...d.disability },
    casualtyLoss: d.casualtyLoss ?? null,
    spouseCategory:
      d.spouseCategory === "general" || d.spouseCategory === "elderly" ? d.spouseCategory : "none",
  };
  return {
    deductions,
    taxCredits: { ...base.taxCredits, ...parsed.taxCredits },
    miscIncome: parseMiscIncome(parsed.miscIncome),
    salaryIncome: parseSalaryIncome(parsed.salaryIncome),
    expandedIncome: normalizeExpandedIncomeInput(parsed.expandedIncome),
    agriculture: normalizeAgricultureInput(parsed.agriculture),
    filingType: FILING_TYPES.includes(parsed.filingType as FilingType)
      ? (parsed.filingType as FilingType)
      : "blue65",
    realEstateBusinessScale: parsed.realEstateBusinessScale === true,
    donationEntries: parseBreakdownEntries(parsed.donationEntries),
    socialInsuranceEntries: parseBreakdownEntries(parsed.socialInsuranceEntries),
    mutualAidEntries: parseBreakdownEntries(parsed.mutualAidEntries),
    medicalEntries: parseBreakdownEntries(parsed.medicalEntries),
    balanceSheet: normalizeBalanceSheetInput(parsed.balanceSheet),
    incomeTaxPayments: parseIncomeTaxPayments(parsed.incomeTaxPayments),
    consumptionFiling: parseConsumptionFiling(parsed.consumptionFiling),
  };
}

// ---------------------------------------------------------------------------
// 変更
// ---------------------------------------------------------------------------

/** 内訳を差し替え、合計を対応する金額フィールドへ同期した新しい状態を返す。 */
export function applyBreakdownEntries(
  state: DeductionState,
  key: BreakdownEntriesKey,
  entries: BreakdownEntry[],
): DeductionState {
  const total = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
  return {
    ...state,
    [BREAKDOWN_STATE_FIELDS[key]]: entries,
    deductions: { ...state.deductions, [BREAKDOWN_TOTAL_FIELDS[key]]: total },
  };
}

/** 変更分を現在の状態へ適用した新しい状態を返す（エージェント経由の編集用）。 */
export function applyDeductionPatch(state: DeductionState, patch: DeductionPatch): DeductionState {
  let next = state;
  if (patch.deductions) {
    const d = patch.deductions;
    next = {
      ...next,
      deductions: {
        ...next.deductions,
        ...d,
        lifeInsurance: { ...next.deductions.lifeInsurance, ...d.lifeInsurance },
        earthquakeInsurance: { ...next.deductions.earthquakeInsurance, ...d.earthquakeInsurance },
        dependents: { ...next.deductions.dependents, ...d.dependents },
        disability: { ...next.deductions.disability, ...d.disability },
      },
    };
  }
  if (patch.taxCredits) next = { ...next, taxCredits: { ...next.taxCredits, ...patch.taxCredits } };
  if (patch.agriculture) {
    next = {
      ...next,
      agriculture: normalizeAgricultureInput({ ...next.agriculture, ...patch.agriculture }),
    };
  }
  if (patch.filingType) next = { ...next, filingType: patch.filingType };
  if (patch.miscIncome) next = { ...next, miscIncome: { ...next.miscIncome, ...patch.miscIncome } };
  if (patch.expandedIncome) {
    const p = patch.expandedIncome;
    const cur = next.expandedIncome;
    next = {
      ...next,
      expandedIncome: normalizeExpandedIncomeInput({
        temp: { ...cur.temp, ...p.temp },
        dividend: { ...cur.dividend, ...p.dividend },
        stocks: {
          ...cur.stocks,
          ...p.stocks,
          general: { ...cur.stocks.general, ...p.stocks?.general },
          listed: { ...cur.stocks.listed, ...p.stocks?.listed },
        },
      }),
    };
  }
  if (patch.entries) {
    for (const key of Object.keys(patch.entries) as BreakdownEntriesKey[]) {
      const entries = patch.entries[key];
      if (entries) next = applyBreakdownEntries(next, key, entries);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// 申告入力から求める値
// ---------------------------------------------------------------------------

/**
 * 帳簿（対象年の取引）と申告入力から、所得と所得税額を求める。
 * 帳簿の所得（事業・不動産・農業）、給与・雑所得、拡張所得の総合課税分を
 * 合計所得とし、拡張所得の申告分離課税分と配当控除も税額計算に渡す。
 * 画面に出す所得の要約と確定スナップショットは、すべてこの結果から作る。
 */
export function computeFilingFigures(
  transactions: Transaction[],
  year: number,
  state: DeductionState,
): FilingFigures {
  const corrected = computeCorrectedFigures(filterYear(transactions, year), year, {
    filingType: state.filingType,
    realEstateBusinessScale: state.realEstateBusinessScale,
    agriculture: state.agriculture,
  });
  const ledgerIncome = ledgerIncomeOf(corrected);
  const manual = computeManualIncomes(year, state.salaryIncome, state.miscIncome, ledgerIncome);
  const expanded = computeExpandedIncomes(state.expandedIncome);
  // 配当所得の赤字は損益通算の対象外（所得税法69条）なので 0 で止めて経常所得に入れる
  const ordinaryIncome =
    ledgerIncome + manual.total + Math.max(expanded.dividend.comprehensiveIncome, 0);
  const totalIncome = comprehensiveTotalIncome(ordinaryIncome, expanded.temp.amount);
  const taxResult = computeIncomeTax({
    year,
    totalIncome,
    deductions: state.deductions,
    taxCredits: resolveTaxCreditInputs(state.taxCredits, expanded),
    separateTaxation: {
      stockIncome: expanded.separateStockIncome,
      dividendIncome: expanded.separateDividendIncome,
    },
  });
  return {
    corrected,
    manual,
    expanded,
    totalIncome,
    tempIncomeAddition: totalIncome - ordinaryIncome,
    taxResult,
  };
}

/** 所得の要約の1行（ラベルと金額）。 */
export interface FilingIncomeRow {
  label: string;
  amount: number;
}

/** 所得合計の行・カードのラベル。青色は控除後の金額であることを添える。 */
export function filingTotalIncomeLabel(isWhite: boolean): string {
  return isWhite ? "所得合計" : "所得合計（青色控除後）";
}

/**
 * 見出しの統計カード（収入合計・支出合計・収支・所得合計）。収入・支出は
 * 帳簿の事業＋不動産だけを数える。口座の生の出入り（チャージ・振替・投資・
 * カード決済などの「その他」区分）まで合計すると実態とかけ離れるため。
 */
export function filingIncomeStatCards(figures: FilingFigures, isWhite: boolean): FilingIncomeRow[] {
  const c = figures.corrected;
  const incomeTotal = c.business_revenue + c.real_estate_revenue;
  const expenseTotal = c.business_expenses + c.real_estate_expenses;
  return [
    { label: "収入合計", amount: incomeTotal },
    { label: "支出合計", amount: expenseTotal },
    { label: "収支（差引）", amount: incomeTotal - expenseTotal },
    { label: filingTotalIncomeLabel(isWhite), amount: figures.totalIncome },
  ];
}

/**
 * 収支から所得合計までの内訳。行を足すと所得合計（合計所得金額の総合課税分）に
 * なる。給与・雑所得・農業・配当・一時は金額があるときだけ出す。雑所得の赤字は
 * 区分ごとの行に出し、他の所得と通算しない分を別の行で戻す。経常所得に損失が
 * あるときの一時所得は、金額と、通算して1/2にしたあと総所得金額に入らない分の
 * 2行で示す。
 */
export function filingIncomeBridgeRows(figures: FilingFigures, isWhite: boolean): FilingIncomeRow[] {
  const c = figures.corrected;
  const { manual, expanded } = figures;
  const agriculture: FilingIncomeRow[] = [
    {
      label: isWhite ? "農業所得" : "農業所得（青色申告特別控除前）",
      amount: c._detail.agriculture_income_before_deduction,
    },
  ];
  // 雑所得の計が区分ごとの金額の和と違う分（他の所得と通算しない赤字）
  const miscRest = manual.miscTotal - (manual.pension + manual.miscBusiness + manual.miscOther);
  const ordinaryIncome = figures.totalIncome - figures.tempIncomeAddition;
  const temp: FilingIncomeRow[] =
    ordinaryIncome >= 0
      ? [{ label: "一時所得（2分の1）", amount: figures.tempIncomeAddition }]
      : [
          { label: "一時所得の金額（特別控除後）", amount: expanded.temp.amount },
          {
            label: "一時所得のうち総所得金額に算入しない額",
            amount: figures.tempIncomeAddition - expanded.temp.amount,
          },
        ];
  const additions: FilingIncomeRow[] = [
    { label: "給与所得", amount: manual.salary },
    { label: "雑所得（公的年金等）", amount: manual.pension },
    { label: "雑所得（業務）", amount: manual.miscBusiness },
    { label: "雑所得（その他）", amount: manual.miscOther },
    { label: "雑所得の赤字のうち他の所得と通算しない額", amount: miscRest },
    { label: "配当所得（総合課税分）", amount: Math.max(expanded.dividend.comprehensiveIncome, 0) },
    ...temp,
  ];
  return [
    { label: "事業の差引", amount: c.business_revenue - c.business_expenses },
    { label: "不動産の差引", amount: c.real_estate_revenue - c.real_estate_expenses },
    ...agriculture.filter((row) => row.amount !== 0),
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: -c.blue_deduction,
    },
    ...additions.filter((row) => row.amount !== 0),
  ];
}

/** 提出パネルに出す申告納税額と第3期分の税額。 */
export interface DeclaredIncomeTax {
  /** 申告納税額。100円未満切捨て。源泉徴収税額の方が多い（還付になる）ときは切り捨てず負のまま */
  declaredTax: number;
  /** 第3期分の税額（申告納税額 − 予定納税額）。正は納める税金、負は還付される税金 */
  thirdPeriodTax: number;
}

/**
 * 所得税及び復興特別所得税の額（外国税額控除後）から源泉徴収税額・予定納税額を
 * 精算する。源泉徴収税額には、提出パネルの入力に加えて配当・株式等譲渡の入力の
 * 源泉徴収税額を含める（XTX の源泉徴収税額と同じ）。
 */
export function declaredIncomeTaxOf(
  figures: FilingFigures,
  payments: IncomeTaxPaymentInputs,
): DeclaredIncomeTax {
  const { taxResult } = figures;
  const withholding = payments.withholdingTax + expandedWithholdingTotal(figures.expanded);
  const raw = taxResult.incomeTaxAfterForeignCredit + taxResult.reconstructionTax - withholding;
  const declaredTax = raw > 0 ? Math.floor(raw / 100) * 100 : raw;
  return { declaredTax, thirdPeriodTax: declaredTax - payments.prepaidTax };
}

/** 確定スナップショットの数値（computeFilingFigures の結果から作る）。 */
export function snapshotFiguresOf(figures: FilingFigures): FilingSnapshotFigures {
  return toSnapshotFigures(figures.corrected, figures.manual, figures.taxResult);
}

/**
 * 確定スナップショット用の計算結果を組み立てる。
 * 所得の内訳は帳簿から、税額は計算結果から取る。計算結果が無い場合は null
 * （スナップショットを作らない）。帳簿に取引が無い年（給与・雑所得だけの年）も作る。
 */
export function buildSnapshotFigures(
  transactions: Transaction[],
  year: number,
  filingOptions: ComputeCorrectedFiguresOptions | undefined,
  miscIncome: MiscIncomeInput | undefined,
  taxResult: IncomeTaxResult | undefined,
  salaryIncome?: SalaryIncomeInput,
): FilingSnapshotFigures | null {
  if (!taxResult) return null;
  const corrected = computeCorrectedFigures(filterYear(transactions, year), year, filingOptions);
  const manual = computeManualIncomes(
    year,
    salaryIncome ?? EMPTY_SALARY_INCOME,
    miscIncome ?? EMPTY_MISC_INCOME,
    ledgerIncomeOf(corrected),
  );
  return toSnapshotFigures(corrected, manual, taxResult);
}

/** 帳簿から求める所得（事業・不動産・農業の青色申告特別控除後）の合計。 */
function ledgerIncomeOf(corrected: CorrectedFigures): number {
  return (
    corrected._detail.business_income +
    corrected._detail.real_estate_income +
    corrected._detail.agriculture_income
  );
}

function toSnapshotFigures(
  corrected: CorrectedFigures,
  manual: ManualIncomeBreakdown,
  taxResult: IncomeTaxResult,
): FilingSnapshotFigures {
  return {
    business_income: corrected._detail.business_income,
    real_estate_income: corrected._detail.real_estate_income,
    misc_income: manual.miscTotal,
    total_income: taxResult.totalIncome,
    total_deductions: taxResult.deductionsTotal,
    taxable_income: taxResult.taxableIncome,
    final_tax: taxResult.finalTax,
  };
}

/**
 * 特定親族（19〜22歳）の合計所得金額を入力として受ける年分か。
 * 特定親族特別控除の段階表を持つ年分だけが対象で、税務パラメータの
 * 無い年分は対象にしない。
 */
export function specialRelativeInputApplies(year: number): boolean {
  return (TAX_PARAMETERS[year]?.specialRelativeTiers ?? null) !== null;
}

/**
 * 基準期間（2年前）の課税売上高（千円・税抜）を帳簿から出す。
 * 2年前の帳簿が無ければ 0（手入力で直す前提）。
 */
export function deriveBasePeriodSalesThousands(transactions: Transaction[], year: number): number {
  const base = summarizeConsumptionTax(transactions, year - 2);
  const excl10 = Math.floor((base.salesIncl10 * 100) / 110);
  const excl8 = Math.floor((base.salesIncl8 * 100) / 108);
  // 輸出などの免税売上も基準期間の課税売上高に含める（消費税がかからないので税抜きしない）
  return Math.floor((excl10 + excl8 + base.exemptSales) / 1000);
}
