/**
 * deductionState.ts — 申告入力（年度別の DeductionState）の保存と読み込み。
 *
 * 保存先はサーバーのDB（filing_inputs）。端末の AsyncStorage は同期読み出し
 * 用のキャッシュとして併用する: 保存は両方へ書き、表示時はサーバーの値を
 * 取り込む。サーバーに無く端末にだけ値がある場合は取り込み時にサーバーへ送る。
 * 保存値の形と検証は @etax/shared の filingInputs が持つ。
 */
import { DeductionState, freshDeductionState, parseDeductionState } from "@etax/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchFilingInputs, saveFilingInputs } from "@/api";

function storageKey(userId: number | null, year: number): string {
  return `etax-deductions-${userId ?? "anon"}-${year}`;
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
 * 無ければ端末の値をサーバーへ送ってから返す。
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
    // 送れなくても端末の値で編集は続けられる
  }
  return local;
}

/** 内訳エントリの新規ID。 */
export function newBreakdownEntryId(): string {
  return `breakdown-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
