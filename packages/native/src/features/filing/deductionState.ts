/**
 * deductionState.ts — 申告入力（年度別の DeductionState）の読み込みと保存。
 *
 * 正はサーバーのDB（filing_inputs）。確定申告画面・納税者情報画面・エージェントは
 * filingInputsStore の1つの値を読み書きする。端末の AsyncStorage には最後に読んだ・
 * 保存した値の写しを置き、サーバーが未保存のときはこの写しを送って使う。
 * 保存値の形と検証は @etax/shared の filingInputs が持つ。
 */
import {
  DeductionPatch,
  DeductionState,
  applyDeductionPatch,
  freshDeductionState,
  parseDeductionState,
} from "@etax/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchFilingInputsResult, saveFilingInputs } from "@/api";
import { YearInputLoadResult, createYearInputStore } from "./yearInputStore";

/** 変更が止まってからサーバーへ保存するまでの待ち時間（ミリ秒）。 */
const SAVE_DELAY_MS = 400;

function storageKey(userId: number | null, year: number): string {
  return `etax-deductions-${userId ?? "anon"}-${year}`;
}

async function readCachedState(userId: number | null, year: number): Promise<DeductionState | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, year));
    return raw ? parseDeductionState(JSON.parse(raw) as Partial<DeductionState>) : null;
  } catch {
    return null;
  }
}

function writeCachedState(userId: number | null, year: number, state: unknown): void {
  AsyncStorage.setItem(storageKey(userId, year), JSON.stringify(state)).catch(() => undefined);
}

/** 端末の写しを読む（無い・壊れているときは空の入力）。 */
export async function loadDeductionState(
  userId: number | null,
  year: number,
): Promise<DeductionState> {
  return (await readCachedState(userId, year)) ?? freshDeductionState();
}

async function loadFromServer(
  userId: number | null,
  year: number,
): Promise<YearInputLoadResult<DeductionState>> {
  const remote = await fetchFilingInputsResult(year);
  if (remote.kind === "failed") return { kind: "failed" };
  if (remote.kind === "saved") {
    writeCachedState(userId, year, remote.value);
    return { kind: "loaded", value: parseDeductionState(remote.value as Partial<DeductionState>) };
  }
  const cached = await readCachedState(userId, year);
  if (!cached) return { kind: "loaded", value: freshDeductionState() };
  // 送れなくても端末の値で編集は続けられ、次の保存でサーバーへ届く
  await saveFilingInputs(year, cached);
  return { kind: "loaded", value: cached };
}

async function saveToServer(
  userId: number | null,
  year: number,
  state: DeductionState,
): Promise<boolean> {
  writeCachedState(userId, year, state);
  return saveFilingInputs(year, state);
}

export const filingInputsStore = createYearInputStore<DeductionState>({
  load: loadFromServer,
  save: saveToServer,
  saveDelayMs: SAVE_DELAY_MS,
});

/** サーバーの値を読み直して返す。取得できなければ例外。 */
export async function hydrateDeductionStateFromServer(
  userId: number | null,
  year: number,
): Promise<DeductionState> {
  const entry = await filingInputsStore.refresh(userId, year);
  if (entry.status !== "ready") throw new Error("申告入力を取得できませんでした");
  return entry.value;
}

/** エージェントの変更分を当て、待たずにサーバーへ保存する。保存できたか。 */
export function applyFilingInputsPatch(
  userId: number | null,
  year: number,
  patch: DeductionPatch,
): Promise<boolean> {
  return filingInputsStore.modify(userId, year, (current) => applyDeductionPatch(current, patch));
}

/** 内訳エントリの新規ID。 */
export function newBreakdownEntryId(): string {
  return `breakdown-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
