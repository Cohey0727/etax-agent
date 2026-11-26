/**
 * deductionState.ts — 控除・税額控除・雑所得・申告種別・貸借対照表の入力（年度別）。
 *
 * 保存先はサーバーのDB（filing_inputs）。端末の AsyncStorage は同期読み出し
 * 用のキャッシュとして併用する: 保存は両方へ書き、表示時はサーバーの値を
 * 取り込む。サーバーに無く端末にだけ値がある場合は取り込み時に移行する。
 * 保存値が壊れていても空の入力にフォールバックする。
 */
import {
  AgricultureInput,
  DeductionInputs,
  EMPTY_AGRICULTURE_INPUT,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_EXPANDED_INCOME,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  ExpandedIncomeInput,
  FilingType,
  MiscIncomeInput,
  SalaryIncomeInput,
  TaxCreditInputs,
  XtxBalanceSheetInput,
  normalizeAgricultureInput,
  normalizeBalanceSheetInput,
  normalizeExpandedIncomeInput,
} from "@etax/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchFilingInputs, saveFilingInputs } from "@/api";

/**
 * 内訳の1件（名称と金額）。寄附金・社会保険料・小規模企業共済等・医療費の
 * ように「内訳があって合計が控除の元になる」入力で共有する。
 */
export interface BreakdownEntry {
  id: string;
  recipient: string;
  amount: number;
}

/** 内訳を持つ控除入力のキー。 */
export type BreakdownEntriesKey = "donations" | "socialInsurance" | "mutualAid" | "medical";

export interface DeductionState {
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
  miscIncome: MiscIncomeInput;
  salaryIncome: SalaryIncomeInput;
  expandedIncome: ExpandedIncomeInput;
  agriculture: AgricultureInput;
  filingType: FilingType;
  realEstateBusinessScale: boolean;
  donationEntries: BreakdownEntry[];
  socialInsuranceEntries: BreakdownEntry[];
  mutualAidEntries: BreakdownEntry[];
  medicalEntries: BreakdownEntry[];
  balanceSheet: XtxBalanceSheetInput | null;
}

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
  };
}

function storageKey(userId: number | null, year: number): string {
  return `etax-deductions-${userId ?? "anon"}-${year}`;
}

function parseSalaryIncome(raw: unknown): SalaryIncomeInput {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_SALARY_INCOME };
  const s = raw as Partial<SalaryIncomeInput>;
  return {
    revenue:
      typeof s.revenue === "number" && Number.isFinite(s.revenue) ? Math.trunc(s.revenue) : 0,
    adjustmentEligible: s.adjustmentEligible === true,
  };
}

function parseMiscIncome(raw: unknown): MiscIncomeInput {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_MISC_INCOME };
  const m = raw as Partial<MiscIncomeInput>;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
  return {
    revenue: num(m.revenue),
    income: num(m.income),
    kubun: num(m.kubun),
    pensionRevenue: num(m.pensionRevenue),
    pensionOver65: m.pensionOver65 === true,
    businessRevenue: num(m.businessRevenue),
    businessIncome: num(m.businessIncome),
    businessKubun: num(m.businessKubun),
  };
}

function parseBreakdownEntries(raw: unknown): BreakdownEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: BreakdownEntry[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== "object" || item === null) return;
    const e = item as Partial<BreakdownEntry>;
    const amount =
      typeof e.amount === "number" && Number.isFinite(e.amount) ? Math.trunc(e.amount) : 0;
    entries.push({
      id: typeof e.id === "string" && e.id ? e.id : `breakdown-loaded-${index}`,
      recipient: typeof e.recipient === "string" ? e.recipient : "",
      amount,
    });
  });
  return entries;
}

/** パース済みの保存値を検証して DeductionState にする。 */
export function parseDeductionState(parsed: Partial<DeductionState>): DeductionState {
  const base = freshDeductionState();
  const d = (parsed.deductions ?? {}) as Partial<DeductionInputs>;
  const deductions: DeductionInputs = {
    ...base.deductions,
    ...d,
    lifeInsurance: { ...base.deductions.lifeInsurance, ...(d.lifeInsurance ?? {}) },
    earthquakeInsurance: {
      ...base.deductions.earthquakeInsurance,
      ...(d.earthquakeInsurance ?? {}),
    },
    dependents: { ...base.deductions.dependents, ...(d.dependents ?? {}) },
    disability: { ...base.deductions.disability, ...(d.disability ?? {}) },
    casualtyLoss: d.casualtyLoss ?? null,
    spouseCategory:
      d.spouseCategory === "general" || d.spouseCategory === "elderly" ? d.spouseCategory : "none",
  };
  return {
    deductions,
    taxCredits: { ...base.taxCredits, ...(parsed.taxCredits ?? {}) },
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
  };
}

/** 端末キャッシュから同期的に近い形で読み込む（非同期）。 */
export async function loadDeductionState(
  userId: number | null,
  year: number,
): Promise<DeductionState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, year));
    if (!raw) return freshDeductionState();
    return parseDeductionState(JSON.parse(raw) as Partial<DeductionState>);
  } catch {
    return freshDeductionState();
  }
}

const serverSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** サーバーへの保存（失敗しても編集は続けられる。連続保存はまとめる）。 */
function saveDeductionStateToServer(year: number, state: DeductionState): void {
  const key = String(year);
  const existing = serverSaveTimers.get(key);
  if (existing) clearTimeout(existing);
  serverSaveTimers.set(
    key,
    setTimeout(() => {
      serverSaveTimers.delete(key);
      void saveFilingInputs(year, state);
    }, 400),
  );
}

/** キャッシュとサーバーの両方へ保存する。 */
export function saveDeductionState(
  userId: number | null,
  year: number,
  state: DeductionState,
): void {
  AsyncStorage.setItem(storageKey(userId, year), JSON.stringify(state)).catch(() => undefined);
  saveDeductionStateToServer(year, state);
}

/**
 * サーバーの保存値を正として取り込む。サーバーに値があればそれを返し、
 * 無ければ端末の値をサーバーへ移行してから返す。
 */
export async function hydrateDeductionStateFromServer(
  userId: number | null,
  year: number,
): Promise<DeductionState> {
  const remote = await fetchFilingInputs(year);
  if (remote) {
    const state = parseDeductionState(remote.state as Partial<DeductionState>);
    AsyncStorage.setItem(storageKey(userId, year), JSON.stringify(remote.state)).catch(
      () => undefined,
    );
    return state;
  }
  const local = await loadDeductionState(userId, year);
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, year));
    if (raw) await saveFilingInputs(year, JSON.parse(raw) as unknown);
  } catch {
    // 移行できなくても端末の値で編集は続けられる
  }
  return local;
}

/** 内訳エントリの新規ID。 */
export function newBreakdownEntryId(): string {
  return `breakdown-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
