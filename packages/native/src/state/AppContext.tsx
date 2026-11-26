/**
 * AppContext.tsx — 全画面共通の状態（選択中の年度・帳簿の取引）。
 * 年度の単一の出所はここ。画面は props ではなくこのコンテキストから引く。
 */
import { Transaction } from "@etax/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LedgerTransaction, fetchLedgerTransactions, ledgerRowToTransaction } from "@/api";
import { useAuth } from "@/auth/AuthContext";

const YEAR_STORAGE_KEY = "etax.selected-year";

export interface AppContextValue {
  year: number;
  years: number[];
  setYear: (year: number) => void;
  /** 帳簿の行（DBのワイヤ形式）。null は DB 未接続。 */
  ledgerRows: LedgerTransaction[] | null;
  /** 画面共通の Transaction へ変換した取引。 */
  transactions: Transaction[];
  ledgerLoading: boolean;
  reloadLedger: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function currentYear(): number {
  return new Date().getFullYear();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [year, setYearState] = useState<number>(currentYear());
  const [ledgerRows, setLedgerRows] = useState<LedgerTransaction[] | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const yearLoadedRef = useRef(false);

  // 保存済みの年度を復元する
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(YEAR_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) {
          setYearState(parsed);
        }
      } catch {
        // 復元できなくても今年で続ける
      }
      yearLoadedRef.current = true;
    })();
  }, []);

  const reloadLedger = useCallback(async () => {
    setLedgerLoading(true);
    const rows = await fetchLedgerTransactions().catch(() => null);
    setLedgerRows(rows);
    setLedgerLoading(false);
  }, []);

  // 認証が確定したら帳簿を読み込む（ユーザー切替時も読み直す）
  useEffect(() => {
    if (!ready) return;
    void reloadLedger();
  }, [ready, user?.id, reloadLedger]);

  const setYear = useCallback((next: number) => {
    setYearState(next);
    AsyncStorage.setItem(YEAR_STORAGE_KEY, String(next)).catch(() => undefined);
  }, []);

  const years = useMemo(() => {
    const set = new Set<number>();
    set.add(currentYear());
    set.add(year);
    for (const row of ledgerRows ?? []) set.add(row.fiscal_year);
    return [...set].sort((a, b) => b - a);
  }, [ledgerRows, year]);

  const transactions = useMemo(
    () => (ledgerRows ?? []).map(ledgerRowToTransaction),
    [ledgerRows],
  );

  const value = useMemo<AppContextValue>(
    () => ({ year, years, setYear, ledgerRows, transactions, ledgerLoading, reloadLedger }),
    [year, years, setYear, ledgerRows, transactions, ledgerLoading, reloadLedger],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState は AppProvider の中で使ってください");
  return ctx;
}
