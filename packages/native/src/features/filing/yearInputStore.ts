/**
 * yearInputStore.ts — 年度別にサーバーへ保存する入力（申告入力・納税者
 * プロフィール）を、画面をまたいで1つの値として持つストア。
 *
 * 画面は Stack に積まれたまま残るため、画面ごとに値の写しを持つと、
 * 戻った先の画面が古い写しを全体置換で保存して他の画面の変更を消す。
 * ここでは同じユーザー・年度の値を1つだけ持ち、変更はその場で全画面へ伝える。
 * サーバーへの保存は少し待ってまとめ、保存が終わっていない変更がある間は
 * サーバーから読み直した値で上書きしない。
 */

export type YearInputEntry<T> =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; value: T };

export type YearInputLoadResult<T> = { kind: "loaded"; value: T } | { kind: "failed" };

export interface YearInputStoreOptions<T> {
  /** サーバーから読む。取得できなかったときは failed（空の値で始めない）。 */
  load: (userId: number | null, year: number) => Promise<YearInputLoadResult<T>>;
  /** サーバーへ保存する。保存できたか。 */
  save: (userId: number | null, year: number, value: T) => Promise<boolean>;
  /** 変更が止まってから保存するまでの待ち時間（ミリ秒）。 */
  saveDelayMs: number;
}

export interface YearInputStore<T> {
  /** 現在の値。読み込み前は loading。値が変わらない間は同じオブジェクトを返す。 */
  get: (userId: number | null, year: number) => YearInputEntry<T>;
  subscribe: (listener: () => void) => () => void;
  /** サーバーから読み直す。保存が終わっていない変更があれば手元の値を残す。 */
  refresh: (userId: number | null, year: number) => Promise<YearInputEntry<T>>;
  /** 値を変える。読み込みが終わる前は何もしない。保存は saveDelayMs 待ってまとめる。 */
  update: (userId: number | null, year: number, change: (current: T) => T) => void;
  /**
   * 読み込みを待ってから値を変え、待たずに保存する。保存できたかを返す
   * （読み込めなかったときは変えずに false）。
   */
  modify: (userId: number | null, year: number, change: (current: T) => T) => Promise<boolean>;
}

interface Slot<T> {
  userId: number | null;
  year: number;
  entry: YearInputEntry<T>;
  /** 変更のたびに進める版。savedRevision と同じなら保存済み。 */
  revision: number;
  savedRevision: number;
  timer: ReturnType<typeof setTimeout> | null;
  loading: Promise<YearInputEntry<T>> | null;
}

const loadingEntry: { status: "loading" } = { status: "loading" };
const failedEntry: { status: "failed" } = { status: "failed" };

export function createYearInputStore<T>(options: YearInputStoreOptions<T>): YearInputStore<T> {
  const slots = new Map<string, Slot<T>>();
  const listeners = new Set<() => void>();

  const keyOf = (userId: number | null, year: number) => `${userId ?? "anon"}:${year}`;

  const slotOf = (userId: number | null, year: number): Slot<T> => {
    const key = keyOf(userId, year);
    const existing = slots.get(key);
    if (existing) return existing;
    const slot: Slot<T> = {
      userId,
      year,
      entry: loadingEntry,
      revision: 0,
      savedRevision: 0,
      timer: null,
      loading: null,
    };
    slots.set(key, slot);
    return slot;
  };

  const setEntry = (slot: Slot<T>, entry: YearInputEntry<T>) => {
    slot.entry = entry;
    for (const listener of listeners) listener();
  };

  const persist = async (slot: Slot<T>): Promise<boolean> => {
    if (slot.timer !== null) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
    if (slot.entry.status !== "ready") return false;
    const revision = slot.revision;
    const ok = await options.save(slot.userId, slot.year, slot.entry.value).catch(() => false);
    if (ok && slot.savedRevision < revision) slot.savedRevision = revision;
    return ok;
  };

  const refresh = (userId: number | null, year: number): Promise<YearInputEntry<T>> => {
    const slot = slotOf(userId, year);
    if (slot.loading) return slot.loading;
    if (slot.entry.status === "failed") setEntry(slot, loadingEntry);
    slot.loading = (async () => {
      const result = await options
        .load(userId, year)
        .catch((): YearInputLoadResult<T> => ({ kind: "failed" }));
      slot.loading = null;
      if (result.kind === "failed") {
        if (slot.entry.status !== "ready") setEntry(slot, failedEntry);
      } else if (slot.revision === slot.savedRevision) {
        setEntry(slot, { status: "ready", value: result.value });
      }
      return slot.entry;
    })();
    return slot.loading;
  };

  const applyChange = (slot: Slot<T>, change: (current: T) => T): boolean => {
    if (slot.entry.status !== "ready") return false;
    slot.revision += 1;
    setEntry(slot, { status: "ready", value: change(slot.entry.value) });
    return true;
  };

  return {
    get: (userId, year) => slots.get(keyOf(userId, year))?.entry ?? loadingEntry,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    update: (userId, year, change) => {
      const slot = slotOf(userId, year);
      if (!applyChange(slot, change)) return;
      if (slot.timer !== null) clearTimeout(slot.timer);
      slot.timer = setTimeout(() => {
        slot.timer = null;
        void persist(slot);
      }, options.saveDelayMs);
    },
    modify: async (userId, year, change) => {
      const slot = slotOf(userId, year);
      if (slot.entry.status !== "ready") await refresh(userId, year);
      if (!applyChange(slot, change)) return false;
      return persist(slot);
    },
  };
}
