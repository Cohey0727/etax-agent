/**
 * deductionStorage.ts — 控除・税額控除・雑所得・申告種別・貸借対照表の入力（年度別）。
 *
 * 保存先はサーバーのDB（filing_inputs）。端末の localStorage は同期読み出し
 * 用のキャッシュとして併用する: 保存は両方へ書き、画面表示時は
 * hydrateDeductionStateFromServer でサーバー値をキャッシュへ取り込む。
 * サーバーに無く端末にだけ値がある場合は、取り込み時にサーバーへ移行する
 * （旧 localStorage 保存からの移行は一度きり）。
 * 保存値が壊れていても空の入力にフォールバックする。
 */
import {
  DeductionInputs,
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
  normalizeBalanceSheetInput,
  normalizeExpandedIncomeInput,
} from "@etax/shared";
import { fetchFilingInputs, saveFilingInputs } from "@utils/api";
import { userScopedKey } from "@utils/userStorage";

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

/** 寄附金の内訳（旧名の互換）。 */
export type DonationEntry = BreakdownEntry;

/** 内訳を持つ控除入力のキー。 */
export type BreakdownEntriesKey = "donations" | "socialInsurance" | "mutualAid" | "medical";

export interface DeductionState {
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
  /** 雑所得（その他）。帳簿に載らない所得の手入力 */
  miscIncome: MiscIncomeInput;
  /** 給与所得。帳簿に載らない給与の手入力（収入金額のみ） */
  salaryIncome: SalaryIncomeInput;
  /** 配当・一時・株式等譲渡の入力（Issue #27） */
  expandedIncome: ExpandedIncomeInput;
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

/** エージェント（set_deductions ツール）から適用される控除入力の変更分。 */
export interface DeductionPatch {
  /** 控除入力の部分上書き（DeductionInputs の形）。 */
  deductions?: Partial<DeductionInputs>;
  /** 申告の種類。 */
  filingType?: FilingType;
  /** 雑所得（その他）の部分上書き。 */
  miscIncome?: Partial<MiscIncomeInput>;
  /** 配当・一時・株式等譲渡の部分上書き（区分ごとに浅くマージ、特定口座の明細は差し替え）。 */
  expandedIncome?: Partial<ExpandedIncomeInput>;
  /** 内訳の差し替え（キーごとに全件差し替え、合計は自動同期）。 */
  entries?: Partial<Record<BreakdownEntriesKey, BreakdownEntry[]>>;
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
        lifeInsurance: { ...next.deductions.lifeInsurance, ...(d.lifeInsurance ?? {}) },
        earthquakeInsurance: {
          ...next.deductions.earthquakeInsurance,
          ...(d.earthquakeInsurance ?? {}),
        },
        dependents: { ...next.deductions.dependents, ...(d.dependents ?? {}) },
        disability: { ...next.deductions.disability, ...(d.disability ?? {}) },
      },
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
        temp: { ...cur.temp, ...(p.temp ?? {}) },
        dividend: { ...cur.dividend, ...(p.dividend ?? {}) },
        stocks: {
          ...cur.stocks,
          ...(p.stocks ?? {}),
          general: { ...cur.stocks.general, ...(p.stocks?.general ?? {}) },
          listed: { ...cur.stocks.listed, ...(p.stocks?.listed ?? {}) },
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
    filingType: "blue65",
    realEstateBusinessScale: false,
    donationEntries: [],
    socialInsuranceEntries: [],
    mutualAidEntries: [],
    medicalEntries: [],
    balanceSheet: null,
  };
}

function storageKey(year: number): string {
  // ユーザーごとに分離する（別アカウントの値をサーバーへ移行しないため）
  return userScopedKey(`etax-amend-deductions-${year}`);
}

/** 保存済みの給与所得を取り出す。数値でない項目は 0 にする。 */
function parseSalaryIncome(raw: unknown): SalaryIncomeInput {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_SALARY_INCOME };
  const s = raw as Partial<SalaryIncomeInput>;
  return {
    revenue: typeof s.revenue === "number" && Number.isFinite(s.revenue) ? Math.trunc(s.revenue) : 0,
    adjustmentEligible: s.adjustmentEligible === true,
  };
}

/** 保存済みの雑所得を取り出す。数値でない項目は 0 にする。 */
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

/** 保存済みの内訳を検証して取り出す。壊れた要素は捨てる。 */
function parseBreakdownEntries(raw: unknown): BreakdownEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: BreakdownEntry[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== "object" || item === null) return;
    const e = item as Partial<BreakdownEntry>;
    const amount = typeof e.amount === "number" && Number.isFinite(e.amount) ? Math.trunc(e.amount) : 0;
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
      d.spouseCategory === "general" || d.spouseCategory === "elderly"
        ? d.spouseCategory
        : "none",
  };
  return {
    deductions,
    taxCredits: { ...base.taxCredits, ...(parsed.taxCredits ?? {}) },
    miscIncome: parseMiscIncome(parsed.miscIncome),
    salaryIncome: parseSalaryIncome(parsed.salaryIncome),
    expandedIncome: normalizeExpandedIncomeInput(parsed.expandedIncome),
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

export function loadDeductionState(year: number): DeductionState {
  try {
    const raw = localStorage.getItem(storageKey(year));
    if (!raw) return freshDeductionState();
    return parseDeductionState(JSON.parse(raw) as Partial<DeductionState>);
  } catch {
    return freshDeductionState();
  }
}

const serverSaveTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** サーバーへの保存（失敗しても編集は続けられる。連続保存はまとめる）。 */
function saveDeductionStateToServer(year: number, state: DeductionState): void {
  const existing = serverSaveTimers.get(year);
  if (existing) clearTimeout(existing);
  serverSaveTimers.set(
    year,
    setTimeout(() => {
      serverSaveTimers.delete(year);
      void saveFilingInputs(year, state);
    }, 400),
  );
}

export function saveDeductionState(year: number, state: DeductionState): void {
  try {
    localStorage.setItem(storageKey(year), JSON.stringify(state));
  } catch {
    // 保存できない環境ではそのまま編集を続ける。
  }
  saveDeductionStateToServer(year, state);
}

/**
 * サーバーの保存値をキャッシュ（localStorage）へ取り込む。
 * サーバーに値があればそれが正。無ければ端末の値をサーバーへ移行する。
 */
export async function hydrateDeductionStateFromServer(year: number): Promise<void> {
  const remote = await fetchFilingInputs(year);
  if (remote) {
    try {
      localStorage.setItem(storageKey(year), JSON.stringify(remote.state));
    } catch {
      // キャッシュへ書けなくても表示はサーバー値で続けられるよう呼び出し側が再読込する。
    }
    return;
  }
  let localRaw: string | null = null;
  try {
    localRaw = localStorage.getItem(storageKey(year));
  } catch {
    localRaw = null;
  }
  if (localRaw) {
    try {
      await saveFilingInputs(year, JSON.parse(localRaw) as unknown);
    } catch {
      // 移行できなくても端末の値で編集は続けられる。
    }
  }
}
