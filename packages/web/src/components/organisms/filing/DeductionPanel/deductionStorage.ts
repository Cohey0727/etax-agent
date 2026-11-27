/**
 * deductionStorage.ts — 申告入力（年度別の DeductionState）の保存と読み込み。
 *
 * 保存先はサーバーのDB（filing_inputs）。端末の localStorage は同期読み出し
 * 用のキャッシュとして併用する: 保存は両方へ書き、画面表示時は
 * hydrateDeductionStateFromServer でサーバー値をキャッシュへ取り込む。
 * サーバーに無く端末にだけ値がある場合は、取り込み時にサーバーへ送る。
 * 保存値の形と検証は @etax/shared の filingInputs が持つ。
 */
import {
  DeductionPatch,
  DeductionState,
  applyDeductionPatch,
  freshDeductionState,
  parseDeductionState,
} from "@etax/shared";
import { fetchFilingInputs, saveFilingInputs } from "@utils/api";
import { userScopedKey } from "@utils/userStorage";

function storageKey(year: number): string {
  // ユーザーごとに分離する（別アカウントの値をサーバーへ送らないため）
  return userScopedKey(`etax-amend-deductions-${year}`);
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

function writeCache(year: number, state: unknown): void {
  try {
    localStorage.setItem(storageKey(year), JSON.stringify(state));
  } catch {
    // 保存できない環境ではそのまま編集を続ける。
  }
}

/** まとめ保存を待っている年度ごとの状態。 */
const pendingServerSaves = new Map<
  number,
  { timer: ReturnType<typeof setTimeout>; state: DeductionState }
>();

/** サーバーへの保存（失敗しても編集は続けられる。連続保存はまとめる）。 */
function saveDeductionStateToServer(year: number, state: DeductionState): void {
  const existing = pendingServerSaves.get(year);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pendingServerSaves.delete(year);
    void saveFilingInputs(year, state);
  }, 400);
  pendingServerSaves.set(year, { timer, state });
}

/** まとめ保存を待っている分があれば、待たずにサーバーへ送る。 */
async function flushPendingServerSave(year: number): Promise<void> {
  const pending = pendingServerSaves.get(year);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingServerSaves.delete(year);
  await saveFilingInputs(year, pending.state);
}

export function saveDeductionState(year: number, state: DeductionState): void {
  writeCache(year, state);
  saveDeductionStateToServer(year, state);
}

/**
 * サーバーの保存値をキャッシュ（localStorage）へ取り込む。
 * サーバーに値があればそれが正。未保存なら端末の値をサーバーへ送る。
 * 取得に失敗したときは何もせず false を返す（呼び出し側は保存を止める）。
 */
export async function hydrateDeductionStateFromServer(year: number): Promise<boolean> {
  const remote = await fetchFilingInputs(year);
  if (remote.status === "failed") return false;
  if (remote.status === "loaded") {
    // キャッシュへ書けなくても、表示はサーバー値で続けられるよう呼び出し側が再読込する。
    writeCache(year, remote.value);
    return true;
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
      // 送れなくても端末の値で編集は続けられる。
    }
  }
  return true;
}

/**
 * エージェントの変更分を、サーバーの保存値に当てて保存する（キャッシュも
 * 更新する）。保存は状態全体の置き換えなので、端末のキャッシュではなく
 * サーバーの値を元にする。画面の編集でまとめ保存を待っている分は、先に
 * 送ってから読む。読めない・保存できないときは false。
 */
export async function applyDeductionPatchToSaved(
  year: number,
  patch: DeductionPatch,
): Promise<boolean> {
  await flushPendingServerSave(year);
  const remote = await fetchFilingInputs(year);
  if (remote.status === "failed") return false;
  const base =
    remote.status === "loaded"
      ? parseDeductionState(remote.value as Partial<DeductionState>)
      : loadDeductionState(year);
  const next = applyDeductionPatch(base, patch);
  if (!(await saveFilingInputs(year, next))) return false;
  writeCache(year, next);
  return true;
}
