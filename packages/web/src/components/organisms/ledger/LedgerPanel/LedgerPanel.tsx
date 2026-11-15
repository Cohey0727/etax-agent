import { ACCOUNT_NAMES, TAX_CATEGORIES, Transaction } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Col,
  Icon,
  Input,
  Row,
  Select,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AppView, LedgerTransaction, LedgerTransactionInput } from "@types";
import {
  createLedgerTransaction,
  deleteLedgerTransaction,
  downloadLedgerPdf,
  fetchLedgerTransactions,
  ledgerRowToTransaction,
  recordClassificationFeedback,
  updateLedgerTransaction,
} from "@utils/api";
import { formatYen } from "@utils/format";
import styles from "./LedgerPanel.css";

export interface LedgerPanelProps {
  /** アプリ全体で保持している取引（他年分とのマージ用）。 */
  transactions: Transaction[];
  year: number;
  /** 帳簿の変更をアプリ全体の取引へ反映する（メモリのみ・遷移なし）。 */
  onSyncTransactions?: (transactions: Transaction[]) => void;
  /** 取込系の画面への遷移（「追加」ドロップダウンの写真から・CSVから使う）。 */
  onNavigate?: (view: AppView) => void;
}

type LoadStatus = "loading" | "ready" | "unavailable";

const INCOME_TYPE_OPTIONS = [
  { value: "business", label: "事業" },
  { value: "real_estate", label: "不動産" },
  { value: "other", label: "対象外" },
] as const;

const CATEGORY_OPTIONS: readonly string[] = ["未分類", ...ACCOUNT_NAMES];

const TAX_CATEGORY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "未設定" },
  ...TAX_CATEGORIES.map((name) => ({ value: name, label: name })),
];

const PERIOD_MONTH_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "全期間" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}月`,
  })),
];

/**
 * Notion式フィルター1件。項目は1つずつ選んで追加し、同じ項目は1つだけ。
 * 条件の値はすべて文字列で持ち、URLクエリへそのまま出し入れする。
 */
type LedgerFilter =
  | { field: "period"; month: string; from: string; to: string }
  | { field: "amount"; min: string; max: string }
  | { field: "category"; value: string }
  | { field: "incomeType"; value: string }
  | { field: "taxCategory"; value: string };

type LedgerFilterField = LedgerFilter["field"];

const FILTER_FIELDS: readonly LedgerFilterField[] = [
  "period",
  "amount",
  "category",
  "incomeType",
  "taxCategory",
];

const FILTER_FIELD_LABELS: Record<LedgerFilterField, string> = {
  period: "期間",
  amount: "金額",
  category: "勘定科目",
  incomeType: "区分",
  taxCategory: "税区分",
};

const emptyFilter = (field: LedgerFilterField): LedgerFilter => {
  switch (field) {
    case "period":
      return { field, month: "", from: "", to: "" };
    case "amount":
      return { field, min: "", max: "" };
    case "category":
      return { field, value: "未分類" };
    case "incomeType":
      return { field, value: "business" };
    case "taxCategory":
      return { field, value: "" };
  }
};

const toInput = (row: LedgerTransaction): LedgerTransactionInput => ({
  date: row.date,
  description: row.description,
  amount: row.amount,
  account: row.account,
  category: row.category,
  income_type: row.income_type,
  tax_category: row.tax_category,
});

const emptyDraft = (year: number): LedgerTransactionInput => ({
  date: `${year}-01-01`,
  description: "",
  amount: 0,
  account: "手入力",
  category: "未分類",
  income_type: "business",
  tax_category: "",
});

export const LedgerPanel = ({ transactions, year, onSyncTransactions, onNavigate }: LedgerPanelProps) => {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [rows, setRows] = useState<LedgerTransaction[]>([]);
  const [edits, setEdits] = useState<Record<number, LedgerTransactionInput>>({});
  const [draft, setDraft] = useState<LedgerTransactionInput>(() => emptyDraft(year));
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  // 検索とフィルターはURLクエリが初期値。共有・リロードで同じ絞り込みを再現する。
  const [initialUrlState] = useState(() =>
    parseFiltersFromSearch(typeof window === "undefined" ? "" : window.location.search, year),
  );
  const [query, setQuery] = useState(initialUrlState.query);
  const [filters, setFilters] = useState<LedgerFilter[]>(initialUrlState.filters);
  const addFormRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const closeDownloadMenu = () => {
    setDownloadMenuOpen(false);
  };

  // 検索・フィルターの状態をURLクエリへ反映する（履歴は汚さない）。
  useEffect(() => {
    const qs = buildFilterSearch(query, filters);
    const current = window.location.pathname + window.location.search;
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== current) window.history.replaceState(null, "", next);
  }, [query, filters]);

  // 年度が変わったら、期間フィルターの日付（旧年度のもの）だけ落とす。
  const prevYearRef = useRef(year);
  useEffect(() => {
    if (prevYearRef.current === year) return;
    prevYearRef.current = year;
    setFilters((prev) =>
      prev.map((f) => (f.field === "period" ? { ...f, month: "", from: "", to: "" } : f)),
    );
  }, [year]);

  const addFilter = (field: LedgerFilterField) => {
    setFilterMenuOpen(false);
    setFilters((prev) =>
      prev.some((f) => f.field === field) ? prev : [...prev, emptyFilter(field)],
    );
  };

  const updateFilter = (next: LedgerFilter) => {
    setFilters((prev) => prev.map((f) => (f.field === next.field ? next : f)));
  };

  const removeFilter = (field: LedgerFilterField) => {
    setFilters((prev) => prev.filter((f) => f.field !== field));
  };

  const clearFilters = () => {
    setQuery("");
    setFilters([]);
  };

  const handleIntakeNavigate = (view: AppView) => {
    closeMenu();
    onNavigate?.(view);
  };

  const handleManualAdd = () => {
    closeMenu();
    setAddFormOpen(true);
    // フォームは表の下に開くので、開いたらそこまでスクロールする。
    window.setTimeout(() => {
      addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const syncParent = (freshRows: LedgerTransaction[]) => {
    if (!onSyncTransactions) return;
    const others = transactions.filter((tx) => tx.year !== year);
    const merged = [...others, ...freshRows.map(ledgerRowToTransaction)].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    onSyncTransactions(merged);
  };

  const applyRows = (freshRows: LedgerTransaction[]) => {
    setRows(freshRows);
    setEdits(Object.fromEntries(freshRows.map((row) => [row.id, toInput(row)])));
    setDeleteArmedId(null);
  };

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setDraft(emptyDraft(year));
    void (async () => {
      const fetched = await fetchLedgerTransactions(year);
      if (cancelled) return;
      if (!fetched) {
        setStatus("unavailable");
        return;
      }
      applyRows(fetched);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
    // 年が変わったら帳簿を読み直す（transactions の変化では読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const handleEdit = (id: number, patch: Partial<LedgerTransactionInput>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const isDirty = (row: LedgerTransaction): boolean => {
    const edit = edits[row.id];
    if (!edit) return false;
    const original = toInput(row);
    return (
      edit.date !== original.date ||
      edit.description !== original.description ||
      edit.amount !== original.amount ||
      edit.account !== original.account ||
      edit.category !== original.category ||
      edit.income_type !== original.income_type ||
      edit.tax_category !== original.tax_category
    );
  };

  const handleSave = async (row: LedgerTransaction) => {
    const edit = edits[row.id];
    if (!edit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLedgerTransaction(row.id, edit);
      const fresh = rows.map((r) => (r.id === row.id ? updated : r));
      applyRows(fresh);
      syncParent(fresh);
      // 科目を直したら学習履歴にも記録し、次回から同じ摘要は直した科目で判定されるようにする。
      if (updated.category !== row.category && updated.category !== "未分類") {
        void recordClassificationFeedback(updated.description, updated.category);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: LedgerTransaction) => {
    if (deleteArmedId !== row.id) {
      setDeleteArmedId(row.id);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLedgerTransaction(row.id);
      const fresh = rows.filter((r) => r.id !== row.id);
      applyRows(fresh);
      syncParent(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    closeDownloadMenu();
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadLedgerPdf(year);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDFのダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCsv = () => {
    closeDownloadMenu();
    try {
      downloadLedgerCsv(year, rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSVのダウンロードに失敗しました");
    }
  };

  const handleAdd = async () => {
    if (busy) return;
    if (!draft.date.startsWith(`${year}-`)) {
      setError(`日付は ${year} 年の日付にしてください`);
      return;
    }
    if (!draft.description.trim()) {
      setError("摘要を入力してください");
      return;
    }
    if (draft.amount === 0) {
      setError("金額を入力してください（支出はマイナス）");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createLedgerTransaction(draft);
      const fresh = [...rows, created].sort((a, b) => a.date.localeCompare(b.date));
      applyRows(fresh);
      syncParent(fresh);
      setDraft(emptyDraft(year));
      // 手入力で科目を選んだ行も学習履歴に記録する（次回の判定で優先される）。
      if (created.category !== "未分類") {
        void recordClassificationFeedback(created.description, created.category);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    // 読み込み中は、実際のレイアウトと同じ形のスケルトンを出す。
    return (
      <Col gap="lg" aria-busy="true" aria-label="帳簿を読み込んでいます">
        <Col gap="md">
          <Row gap="md" align="center" justify="spaceBetween">
            <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
            <div className={`${styles.skeleton} ${styles.skeletonButton}`} />
          </Row>
          <div className={styles.statGrid}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <Col gap="sm">
                  <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
                  <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
                </Col>
              </Card>
            ))}
          </div>
          <div className={`${styles.skeleton} ${styles.skeletonSearch}`} />
          <Card>
            <Col gap="sm">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className={`${styles.skeleton} ${styles.skeletonRow}`} />
              ))}
            </Col>
          </Card>
        </Col>
      </Col>
    );
  }

  if (status === "unavailable") {
    return (
      <AlertBox variant="notice">
        帳簿データベースに接続できません。サーバー側でDB（SQLite）を開けていない可能性があります。
        接続されると、この画面で取引の保存・編集ができるようになります。
      </AlertBox>
    );
  }

  // 検索は摘要・勘定科目・出所・税区分の部分一致（大文字小文字は区別しない）。
  // フィルターは追加した項目すべてに一致するものだけを残す。
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (!filters.every((filter) => matchesFilter(row, filter))) return false;
    if (!normalizedQuery) return true;
    return [row.description, row.category, row.account, row.tax_category].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });

  // 統計は表示中（絞り込み後）の取引で集計する。期間を絞れば、その期間の合計が見える。
  const incomeTotal = visibleRows.reduce(
    (sum, row) => (row.amount > 0 ? sum + row.amount : sum),
    0,
  );
  const expenseTotal = visibleRows.reduce(
    (sum, row) => (row.amount < 0 ? sum - row.amount : sum),
    0,
  );

  const stats: readonly { label: string; value: string }[] = [
    { label: "取引件数", value: `${visibleRows.length}件` },
    { label: "収入", value: formatYen(incomeTotal) },
    { label: "支出", value: formatYen(expenseTotal) },
    { label: "差引", value: formatYen(incomeTotal - expenseTotal) },
  ];

  return (
    <Col gap="lg">
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}
      <Col gap="md">
          <Row gap="md" align="center" justify="spaceBetween">
            <Text variant="sectionTitle">{year}年の帳簿</Text>
            <Row gap="md" align="center">
              <div className={styles.addMenuWrap}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={downloading}
                  onClick={() => {
                    closeMenu();
                    setDownloadMenuOpen((open) => !open);
                  }}
                >
                  ダウンロード
                  <Icon name="chevronDown" size={15} />
                </Button>
                {downloadMenuOpen ? (
                  <>
                    <div className={styles.menuBackdrop} onClick={closeDownloadMenu} />
                    <div className={styles.addMenu} role="menu">
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => void handleDownloadPdf()}
                      >
                        <Icon name="bill" size={16} />
                        PDFでダウンロード
                      </button>
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={handleDownloadCsv}
                      >
                        <Icon name="grid" size={16} />
                        CSVでダウンロード
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              <div className={styles.addMenuWrap}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    closeDownloadMenu();
                    if (menuOpen) closeMenu();
                    else setMenuOpen(true);
                  }}
                >
                  <Icon name="plus" size={15} />
                  追加
                  <Icon name="chevronDown" size={15} />
                </Button>
                {menuOpen ? (
                  <>
                    <div className={styles.menuBackdrop} onClick={closeMenu} />
                    <div className={styles.addMenu} role="menu">
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleIntakeNavigate(AppView.Receipt)}
                      >
                        <Icon name="receipt" size={16} />
                        写真から
                      </button>
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleIntakeNavigate(AppView.Import)}
                      >
                        <Icon name="import" size={16} />
                        CSVから
                      </button>
                      <button type="button" className={styles.menuItem} onClick={handleManualAdd}>
                        <Icon name="plus" size={16} />
                        手動
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </Row>
          </Row>
          <div className={styles.statGrid}>
            {stats.map((stat) => (
              <Card key={stat.label}>
                <Col gap="none">
                  <Text variant="statLabel">{stat.label}</Text>
                  <Text variant="statValue">{stat.value}</Text>
                </Col>
              </Card>
            ))}
          </div>
          <Row gap="sm" align="center">
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <Icon name="search" size={16} />
              </span>
              <Input
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="摘要・科目・出所で検索"
                aria-label="取引を検索"
              />
            </div>
            {normalizedQuery || filters.length > 0 ? (
              <>
                <Text variant="muted">{visibleRows.length}件ヒット</Text>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  クリア
                </Button>
              </>
            ) : null}
          </Row>
          <Row gap="sm" align="center" wrap>
            {filters.map((filter) => (
              <FilterChip
                key={filter.field}
                filter={filter}
                year={year}
                onChange={updateFilter}
                onRemove={() => removeFilter(filter.field)}
              />
            ))}
            <div className={styles.addMenuWrap}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterMenuOpen((open) => !open)}
              >
                <Icon name="plus" size={14} />
                フィルター
              </Button>
              {filterMenuOpen ? (
                <>
                  <div className={styles.menuBackdrop} onClick={() => setFilterMenuOpen(false)} />
                  <div className={`${styles.addMenu} ${styles.addMenuLeft}`} role="menu">
                    {FILTER_FIELDS.filter(
                      (field) => !filters.some((f) => f.field === field),
                    ).map((field) => (
                      <button
                        key={field}
                        type="button"
                        className={styles.menuItem}
                        onClick={() => addFilter(field)}
                      >
                        {FILTER_FIELD_LABELS[field]}
                      </button>
                    ))}
                    {filters.length === FILTER_FIELDS.length ? (
                      <Text variant="muted" className={styles.menuNote}>
                        すべての項目を追加済みです
                      </Text>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </Row>
          {rows.length === 0 ? (
            <Text variant="body">
              この年の取引はまだありません。右上の「追加」ボタンから追加するか、CSV取込・領収書から
              取り込むと自動で帳簿に保存されます。
            </Text>
          ) : visibleRows.length === 0 ? (
            <Text variant="body">条件に一致する取引はありません。</Text>
          ) : (
            <div className={styles.tableWrap}>
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>日付</TableHeaderCell>
                  <TableHeaderCell>摘要</TableHeaderCell>
                  <TableHeaderCell>金額（税込）</TableHeaderCell>
                  <TableHeaderCell>勘定科目</TableHeaderCell>
                  <TableHeaderCell>区分</TableHeaderCell>
                  <TableHeaderCell>税区分</TableHeaderCell>
                  <TableHeaderCell>出所</TableHeaderCell>
                  <TableHeaderCell>操作</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const edit = edits[row.id] ?? toInput(row);
                  const dirty = isDirty(row);
                  return (
                    <tr key={row.id}>
                      <TableCell>
                        <Input
                          type="date"
                          className={styles.cellInput}
                          value={edit.date}
                          onChange={(e) => handleEdit(row.id, { date: e.target.value })}
                          aria-label="日付"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className={styles.descriptionInput}
                          value={edit.description}
                          onChange={(e) => handleEdit(row.id, { description: e.target.value })}
                          aria-label="摘要"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className={styles.amountInput}
                          value={edit.amount}
                          onChange={(e) =>
                            handleEdit(row.id, { amount: Number(e.target.value) })
                          }
                          aria-label="金額"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edit.category}
                          onChange={(e) => handleEdit(row.id, { category: e.target.value })}
                          aria-label="勘定科目"
                        >
                          {CATEGORY_OPTIONS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edit.income_type}
                          onChange={(e) => handleEdit(row.id, { income_type: e.target.value })}
                          aria-label="区分"
                        >
                          {INCOME_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={edit.tax_category}
                          onChange={(e) => handleEdit(row.id, { tax_category: e.target.value })}
                          aria-label="税区分"
                        >
                          {TAX_CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          {edit.tax_category && !TAX_CATEGORIES.includes(edit.tax_category) ? (
                            <option value={edit.tax_category}>{edit.tax_category}</option>
                          ) : null}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className={styles.cellInput}
                          value={edit.account}
                          onChange={(e) => handleEdit(row.id, { account: e.target.value })}
                          aria-label="出所"
                        />
                      </TableCell>
                      <TableCell className={styles.actionsCell}>
                        <Row gap="sm" align="center" className={styles.actionsRow}>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!dirty || busy}
                            onClick={() => void handleSave(row)}
                          >
                            保存
                          </Button>
                          <Button
                            variant={deleteArmedId === row.id ? "danger" : "ghost"}
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleDelete(row)}
                          >
                            {deleteArmedId === row.id ? "本当に削除" : "削除"}
                          </Button>
                        </Row>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            </div>
          )}
      </Col>
      {addFormOpen ? (
        <div ref={addFormRef}>
          <Card>
            <Col gap="md">
              <Row gap="md" align="center" justify="spaceBetween">
                <Text variant="sectionTitle">取引を追加（手動）</Text>
                <Button variant="ghost" size="sm" onClick={() => setAddFormOpen(false)}>
                  閉じる
                </Button>
              </Row>
              <div className={styles.addGrid}>
            <Col gap="sm">
              <Text variant="statLabel">日付</Text>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">摘要</Text>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="例: サーバー利用料"
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">金額（支出はマイナス）</Text>
              <Input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">勘定科目</Text>
              <Select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {CATEGORY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">区分</Text>
              <Select
                value={draft.income_type}
                onChange={(e) => setDraft({ ...draft, income_type: e.target.value })}
              >
                {INCOME_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">税区分</Text>
              <Select
                value={draft.tax_category}
                onChange={(e) => setDraft({ ...draft, tax_category: e.target.value })}
              >
                {TAX_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">出所</Text>
              <Input
                value={draft.account}
                onChange={(e) => setDraft({ ...draft, account: e.target.value })}
              />
            </Col>
          </div>
              <Row gap="sm" align="center">
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void handleAdd()}>
                  帳簿に追加
                </Button>
                <Text variant="caption">追加・保存・削除はそのまま帳簿データベースに記録されます。</Text>
              </Row>
            </Col>
          </Card>
        </div>
      ) : null}
    </Col>
  );
};

/** フィルター1件分のチップ。項目名＋条件の入力＋削除ボタンで構成する。 */
const FilterChip = ({
  filter,
  year,
  onChange,
  onRemove,
}: {
  filter: LedgerFilter;
  year: number;
  onChange: (next: LedgerFilter) => void;
  onRemove: () => void;
}) => {
  return (
    <div className={styles.filterChip}>
      <Text variant="caption">{FILTER_FIELD_LABELS[filter.field]}</Text>
      {filter.field === "period" ? (
        <>
          <Select
            className={styles.chipSelect}
            value={filter.month}
            onChange={(e) => {
              const month = e.target.value;
              const range = monthRange(year, month);
              onChange({ ...filter, month, from: range.from, to: range.to });
            }}
            aria-label="月で絞り込み"
          >
            {PERIOD_MONTH_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            className={styles.chipInput}
            value={filter.from}
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            onChange={(e) => onChange({ ...filter, month: "", from: e.target.value })}
            aria-label="開始日"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="date"
            className={styles.chipInput}
            value={filter.to}
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            onChange={(e) => onChange({ ...filter, month: "", to: e.target.value })}
            aria-label="終了日"
          />
        </>
      ) : filter.field === "amount" ? (
        <>
          <Input
            type="number"
            min={0}
            className={styles.chipNumber}
            value={filter.min}
            onChange={(e) => onChange({ ...filter, min: e.target.value })}
            placeholder="最小"
            aria-label="金額（最小・絶対値）"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="number"
            min={0}
            className={styles.chipNumber}
            value={filter.max}
            onChange={(e) => onChange({ ...filter, max: e.target.value })}
            placeholder="最大"
            aria-label="金額（最大・絶対値）"
          />
          <Text variant="muted">円</Text>
        </>
      ) : filter.field === "category" ? (
        <Select
          className={styles.chipSelect}
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          aria-label="勘定科目"
        >
          {CATEGORY_OPTIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      ) : filter.field === "incomeType" ? (
        <Select
          className={styles.chipSelect}
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          aria-label="区分"
        >
          {INCOME_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Select
          className={styles.chipSelect}
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          aria-label="税区分"
        >
          {TAX_CATEGORY_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
      <button
        type="button"
        className={styles.chipRemove}
        onClick={onRemove}
        aria-label={`${FILTER_FIELD_LABELS[filter.field]}フィルターを削除`}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
};

/** 月選択から、その月の開始日・終了日を作る。"" なら範囲なし。 */
function monthRange(year: number, month: string): { from: string; to: string } {
  if (!month) return { from: "", to: "" };
  const m = Number(month);
  const mm = String(m).padStart(2, "0");
  const lastDay = new Date(year, m, 0).getDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/** 取引がフィルター1件に一致するか。金額は絶対値で比べる。 */
function matchesFilter(row: LedgerTransaction, filter: LedgerFilter): boolean {
  switch (filter.field) {
    case "period":
      return (!filter.from || row.date >= filter.from) && (!filter.to || row.date <= filter.to);
    case "amount": {
      const abs = Math.abs(row.amount);
      const min = filter.min.trim() === "" ? null : Number(filter.min);
      const max = filter.max.trim() === "" ? null : Number(filter.max);
      if (min !== null && Number.isFinite(min) && abs < min) return false;
      if (max !== null && Number.isFinite(max) && abs > max) return false;
      return true;
    }
    case "category":
      return row.category === filter.value;
    case "incomeType":
      return row.income_type === filter.value;
    case "taxCategory":
      return row.tax_category === filter.value;
  }
}

/** URLクエリから検索・フィルターの初期状態を読む。不正な値や他年度の日付は落とす。 */
function parseFiltersFromSearch(
  search: string,
  year: number,
): { query: string; filters: LedgerFilter[] } {
  const params = new URLSearchParams(search);
  const requested = (params.get("filters") ?? "")
    .split(",")
    .filter(
      (field, index, all) =>
        FILTER_FIELDS.includes(field as LedgerFilterField) && all.indexOf(field) === index,
    );
  const filters: LedgerFilter[] = requested.map((rawField) => {
    const field = rawField as LedgerFilterField;
    switch (field) {
      case "period": {
        const from = params.get("from") ?? "";
        const to = params.get("to") ?? "";
        return {
          field,
          month: params.get("month") ?? "",
          from: from.startsWith(`${year}-`) ? from : "",
          to: to.startsWith(`${year}-`) ? to : "",
        };
      }
      case "amount":
        return { field, min: params.get("amin") ?? "", max: params.get("amax") ?? "" };
      case "category":
        return { field, value: params.get("cat") ?? "未分類" };
      case "incomeType":
        return { field, value: params.get("itype") ?? "business" };
      case "taxCategory":
        return { field, value: params.get("tax") ?? "" };
    }
  });
  return { query: params.get("q") ?? "", filters };
}

/** 検索・フィルターの状態をURLクエリ文字列にする。 */
function buildFilterSearch(query: string, filters: LedgerFilter[]): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filters.length > 0) {
    params.set("filters", filters.map((f) => f.field).join(","));
    for (const filter of filters) {
      switch (filter.field) {
        case "period":
          if (filter.month) params.set("month", filter.month);
          if (filter.from) params.set("from", filter.from);
          if (filter.to) params.set("to", filter.to);
          break;
        case "amount":
          if (filter.min) params.set("amin", filter.min);
          if (filter.max) params.set("amax", filter.max);
          break;
        case "category":
          params.set("cat", filter.value);
          break;
        case "incomeType":
          params.set("itype", filter.value);
          break;
        case "taxCategory":
          params.set("tax", filter.value);
          break;
      }
    }
  }
  return params.toString();
}

const CSV_HEADER: readonly string[] = ["日付", "摘要", "金額", "勘定科目", "区分", "税区分", "出所"];

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** 帳簿（その年の全取引）をCSVでダウンロードする。Excelで開けるようBOMを付ける。 */
function downloadLedgerCsv(year: number, rows: LedgerTransaction[]): void {
  const lines = rows.map((row) =>
    [
      row.date,
      row.description,
      row.amount,
      row.category,
      INCOME_TYPE_OPTIONS.find((option) => option.value === row.income_type)?.label ??
        row.income_type,
      row.tax_category,
      row.account,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["\uFEFF" + [CSV_HEADER.join(","), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ledger-${year}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
