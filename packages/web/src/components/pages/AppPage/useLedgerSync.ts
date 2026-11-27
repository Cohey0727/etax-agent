import { applyCsvClassificationEdits, Transaction } from "@etax/shared";
import { useEffect, useState } from "react";
import { AppView } from "@types";
import {
  fetchLedgerTransactions,
  ledgerRowToTransaction,
  replaceYearLedgerTransactions,
  transactionToLedgerInput,
  updateLedgerTransaction,
} from "@utils/api";

/**
 * useLedgerSync.ts — 帳簿（DB）と画面の取引状態の同期（AppPage 用フック）。
 *
 * 起動時に帳簿を読み、保存済みの取引があればそれを正として表示する。
 * 認証の確認が終わるまでは取得しない。未ログインのまま初回取得すると
 * 401 で失敗し、ログイン後も読み直されず取引0件表示のままになるため、
 * ログイン状態（ユーザーID）が変わるたびに読み直す（Issue #10-3）。
 */
export function useLedgerSync(options: {
  authChecked: boolean;
  authUserId: number | null;
  sample: Transaction[];
  setActiveView: (view: AppView) => void;
}) {
  const { authChecked, authUserId, sample, setActiveView } = options;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dataSource, setDataSource] = useState("帳簿");
  // 起動時の帳簿読み込みが終わるまではスケルトンを出す（サンプルデータは初期表示に使わない）。
  const [ledgerLoading, setLedgerLoading] = useState(true);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    void (async () => {
      const rows = await fetchLedgerTransactions();
      if (cancelled) return;
      if (rows && rows.length > 0) {
        setTransactions(rows.map(ledgerRowToTransaction));
        setDataSource("帳簿");
      }
      setLedgerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, authUserId]);

  /** 確定した取引を帳簿へ保存する（年ごとに置き換え。失敗しても画面は継続）。 */
  const saveTransactionsByYear = (next: Transaction[]) => {
    const yearsToSave = [...new Set(next.map((tx) => tx.year))];
    for (const saveYear of yearsToSave) {
      const inputs = next
        .filter((tx) => tx.year === saveYear)
        .map(transactionToLedgerInput);
      void replaceYearLedgerTransactions(saveYear, inputs).catch(() => {
        // 帳簿が未接続の環境ではメモリ上のみで動く
      });
    }
  };

  const handleUseImported = (next: Transaction[]) => {
    setTransactions(next);
    setDataSource("取込CSV");
    setActiveView(AppView.Dashboard);
    saveTransactionsByYear(next);
  };

  /**
   * 領収書から登録した取引（帳簿への保存は登録側で済んでいる）を画面へ加える。
   * 取込と違い、登録しても画面は遷移させない（その場で続けて撮影・登録できるようにする）。
   */
  const handleRegisterTransaction = (tx: Transaction) => {
    setTransactions((current) => [...current, tx]);
  };

  // CSV取込（DB保存済み）の「ダッシュボードで使う」専用経路。
  // 取込レスポンスの transactions は新規分のみ（最大500件）で年度の完全な
  // 集合ではないため、それで画面を置き換えると既存行が消え、続く年度置換で
  // DBからも消える（Issue #10-2）。影響年度はサーバーの帳簿を正として
  // 読み直し、その年度の分だけ画面へ反映する。年度置換は行わない
  // （取込分はサーバーが保存済みで、置き換える必要がない）。
  const handleUseCsvImported = (imported: Transaction[]) => {
    setActiveView(AppView.Dashboard);
    const importedYears = [...new Set(imported.map((tx) => tx.year))];
    if (importedYears.length === 0) return;
    void (async () => {
      const fetchedByYear = new Map<number, Transaction[]>();
      for (const importYear of importedYears) {
        const rows = await fetchLedgerTransactions(importYear);
        if (!rows) continue;
        const edited = await applyCsvClassificationEdits(
          rows,
          imported.filter((tx) => tx.year === importYear),
          (row) =>
            updateLedgerTransaction(row.id, transactionToLedgerInput(ledgerRowToTransaction(row))),
        );
        fetchedByYear.set(importYear, edited.map(ledgerRowToTransaction));
      }
      setTransactions((current) => {
        const merged = current.filter((tx) => !importedYears.includes(tx.year));
        for (const importYear of importedYears) {
          const fetched = fetchedByYear.get(importYear);
          if (fetched) {
            merged.push(...fetched);
          } else {
            // 読み直せなかった年度はメモリ上の既存分＋取込分で保持する（消さない）
            merged.push(
              ...current.filter((tx) => tx.year === importYear),
              ...imported.filter((tx) => tx.year === importYear),
            );
          }
        }
        return merged;
      });
      if (fetchedByYear.size > 0) setDataSource("帳簿");
    })();
  };

  const handleSyncTransactions = (next: Transaction[]) => {
    setTransactions(next);
    setDataSource("帳簿");
  };

  const handleLoadSample = () => {
    setTransactions(sample);
    setDataSource("サンプルデータ");
  };

  /** エージェントが帳簿DBへ書き込んだ後に、帳簿の最新状態を読み直して反映する。 */
  const reloadTransactions = () => {
    void (async () => {
      const rows = await fetchLedgerTransactions();
      if (!rows) return;
      setTransactions(rows.map(ledgerRowToTransaction));
      setDataSource("帳簿");
    })();
  };

  return {
    transactions,
    dataSource,
    ledgerLoading,
    handleUseImported,
    handleRegisterTransaction,
    handleUseCsvImported,
    handleSyncTransactions,
    handleLoadSample,
    reloadTransactions,
  };
}
