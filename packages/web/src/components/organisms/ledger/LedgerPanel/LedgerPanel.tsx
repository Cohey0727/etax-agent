import {
  ACCOUNT_NAMES,
  TAX_CATEGORIES,
  Transaction,
  normalizeSearchText,
  taxCategorySignMismatch,
} from "@etax/shared";
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
import { AlertBox, MultiSelectFilter } from "@components/molecules";
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

// 1行にセレクトや入力が並ぶため、全件を一度に描画すると画面が重くなる。
// 1ページこの件数だけ描画するページネーションにする（集計は全件のまま）。
const PAGE_SIZE = 100;

/**
 * Notion式フィルター1件。項目は1つずつ選んで追加し、同じ項目は1つだけ。
 * 条件の値はすべて文字列で持ち、URLクエリへそのまま出し入れする。
 * 勘定科目・区分・税区分は複数選択（values が空なら「すべて」）。
 */
type LedgerFilter =
  | { field: "year"; value: string }
  | { field: "period"; from: string; to: string }
  | { field: "amount"; min: string; max: string }
  | { field: "category"; values: string[] }
  | { field: "incomeType"; values: string[] }
  | { field: "taxCategory"; values: string[] }
  | { field: "mismatch" };

type LedgerFilterField = LedgerFilter["field"];

const FILTER_FIELDS: readonly LedgerFilterField[] = [
  "year",
  "period",
  "amount",
  "category",
  "incomeType",
  "taxCategory",
  "mismatch",
];

const FILTER_FIELD_LABELS: Record<LedgerFilterField, string> = {
  year: "年度",
  period: "期間",
  amount: "金額",
  category: "勘定科目",
  incomeType: "区分",
  taxCategory: "税区分",
  mismatch: "税区分の符号不一致",
};

const emptyFilter = (field: LedgerFilterField): LedgerFilter => {
  switch (field) {
    case "year":
      return { field, value: "" };
    case "period":
      return { field, from: "", to: "" };
    case "amount":
      return { field, min: "", max: "" };
    case "category":
      return { field, values: ["未分類"] };
    case "incomeType":
      return { field, values: ["business"] };
    case "taxCategory":
      return { field, values: [] };
    case "mismatch":
      return { field };
  }
};

const toInput = (row: LedgerTransaction): LedgerTransactionInput => ({
  date: row.date,
  fiscal_year: row.fiscal_year,
  description: row.description,
  amount: row.amount,
  account: row.account,
  category: row.category,
  income_type: row.income_type,
  tax_category: row.tax_category,
});

const emptyDraft = (fiscalYear: number): LedgerTransactionInput => ({
  date: `${fiscalYear}-01-01`,
  fiscal_year: fiscalYear,
  description: "",
  amount: 0,
  account: "手入力",
  category: "未分類",
  income_type: "business",
  tax_category: "",
});

/** 年度フィルターで選ばれている年度（未選択・全年度なら null）。 */
const activeYearOf = (filters: readonly LedgerFilter[]): number | null => {
  const yearFilter = filters.find((f) => f.field === "year");
  if (!yearFilter || yearFilter.field !== "year" || !yearFilter.value) return null;
  const year = Number(yearFilter.value);
  return Number.isInteger(year) ? year : null;
};

/** 検索・フィルターを適用した表示用の行を作る。 */
const filterRows = (
  rows: readonly LedgerTransaction[],
  query: string,
  filters: readonly LedgerFilter[],
): LedgerTransaction[] => {
  // 全角英数・半角カタカナでも当たるよう、クエリと対象の両方を正規化する。
  const normalizedQuery = normalizeSearchText(query.trim());
  return rows.filter((row) => {
    if (!filters.every((filter) => matchesFilter(row, filter))) return false;
    if (!normalizedQuery) return true;
    return [row.description, row.category, row.account, row.tax_category].some((value) =>
      normalizeSearchText(value).includes(normalizedQuery),
    );
  });
};

/** ページネーションの並び。先頭・末尾と現在ページの前後だけ出し、間は「…」で畳む。 */
function pageList(current: number, total: number): readonly (number | "gap")[] {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const page of pages) {
    const prev = items[items.length - 1];
    if (typeof prev === "number" && page - prev > 1) items.push("gap");
    items.push(page);
  }
  return items;
}

export const LedgerPanel = ({ onSyncTransactions, onNavigate }: LedgerPanelProps) => {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [rows, setRows] = useState<LedgerTransaction[]>([]);
  const [edits, setEdits] = useState<Record<number, LedgerTransactionInput>>({});
  const [draft, setDraft] = useState<LedgerTransactionInput>(() =>
    emptyDraft(new Date().getFullYear()),
  );
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
    parseFiltersFromSearch(typeof window === "undefined" ? "" : window.location.search),
  );
  const [query, setQuery] = useState(initialUrlState.query);
  const [filters, setFilters] = useState<LedgerFilter[]>(initialUrlState.filters);
  // 表示中のページと、そのページが属する絞り込み条件の署名。
  // 署名が変われば（＝絞り込みが変われば）1ページ目に戻る。
  const [pageState, setPageState] = useState<{ signature: string; page: number }>({
    signature: "",
    page: 1,
  });
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
    // 期間フィルターは常設で消せない。
    if (field === "period") return;
    setFilters((prev) => prev.filter((f) => f.field !== field));
  };

  const clearFilters = () => {
    setQuery("");
    // 期間フィルターは残し、値だけ空（全期間）に戻す。
    setFilters([emptyFilter("period")]);
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

  // 帳簿（DB）が全年度の正。変更後は全行をそのままアプリ全体の取引へ反映する。
  const syncParent = (freshRows: LedgerTransaction[]) => {
    if (!onSyncTransactions) return;
    const merged = freshRows
      .map(ledgerRowToTransaction)
      .sort((a, b) => a.date.localeCompare(b.date));
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
    void (async () => {
      const fetched = await fetchLedgerTransactions();
      if (cancelled) return;
      if (!fetched) {
        setStatus("unavailable");
        return;
      }
      applyRows(fetched);
      // 追加フォームの初期年度は、データにある最新の割り当て年度に合わせる。
      const latestYear = fetched.reduce((max, row) => Math.max(max, row.fiscal_year), 0);
      if (latestYear > 0) setDraft(emptyDraft(latestYear));
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
    // 帳簿は全年度を初回に読み込むだけ（transactions の変化では読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = (id: number, patch: Partial<LedgerTransactionInput>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const isDirty = (row: LedgerTransaction): boolean => {
    const edit = edits[row.id];
    if (!edit) return false;
    const original = toInput(row);
    return (
      edit.date !== original.date ||
      edit.fiscal_year !== original.fiscal_year ||
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
    // PDFは年度単位で作るため、年度フィルターで1つの年度に絞られているときだけ出す。
    const pdfYear = activeYearOf(filters);
    if (!pdfYear) {
      setError("PDFは年度フィルターで1つの年度に絞り込んでからダウンロードしてください");
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      await downloadLedgerPdf(pdfYear);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDFのダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCsv = () => {
    closeDownloadMenu();
    try {
      const csvYear = activeYearOf(filters);
      downloadLedgerCsv(filterRows(rows, query, filters), csvYear ? String(csvYear) : "all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSVのダウンロードに失敗しました");
    }
  };

  const handleAdd = async () => {
    if (busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError("日付を入力してください");
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
      setDraft(emptyDraft(created.fiscal_year));
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
        帳簿データベースに接続できません。サーバー側のデータベースが起動していない可能性があります。
        接続されると、この画面で取引の保存・編集ができるようになります。
      </AlertBox>
    );
  }

  // 検索は摘要・勘定科目・出所・税区分の部分一致（大文字小文字は区別しない）。
  // フィルターは追加した項目すべてに一致するものだけを残す。
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = filterRows(rows, query, filters);
  // 描画は現在のページの分だけ。集計・CSVは visibleRows 全件が対象で変わらない。
  const filterSignature = JSON.stringify({ query, filters });
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage =
    pageState.signature === filterSignature ? Math.min(pageState.page, totalPages) : 1;
  const displayedRows = visibleRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const goToPage = (page: number) =>
    setPageState({ signature: filterSignature, page: Math.min(Math.max(1, page), totalPages) });
  // 年度の選択肢はデータにある割り当て年度から作る（新しい順）。
  const yearOptions = [...new Set(rows.map((row) => row.fiscal_year))].sort((a, b) => b - a);
  // 期間フィルターは常設で、検索の左に置く。それ以外は下の段に並べる。
  const periodFilter = filters.find((f) => f.field === "period");
  const otherFilters = filters.filter((f) => f.field !== "period");

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
            <Text variant="sectionTitle">帳簿</Text>
            <Row gap="md" align="center">
              <div className={styles.addMenuWrap}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={downloading}
                  disabledReason="ダウンロード中です"
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
          <Row gap="sm" align="center" justify="spaceBetween" wrap>
            <Row gap="sm" align="center" wrap>
              {periodFilter ? (
                <FilterChip
                  bare
                  filter={periodFilter}
                  years={yearOptions}
                  onChange={updateFilter}
                />
              ) : null}
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
            </Row>
            {/* クリアは常時表示。条件が無ければ押しても何も起きない。 */}
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              クリア
            </Button>
          </Row>
          <Row gap="sm" align="center" wrap>
            {otherFilters.map((filter) => (
              <FilterChip
                key={filter.field}
                filter={filter}
                years={yearOptions}
                onChange={updateFilter}
                onRemove={() => removeFilter(filter.field)}
              />
            ))}
            <div className={styles.addMenuWrap}>
              <Button
                variant="ghost"
                size="sm"
                className={styles.rowButton}
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
              まだ取引がありません。右上の「追加」ボタンから追加するか、CSV取込・領収書から
              取り込むと自動で帳簿に保存されます。
            </Text>
          ) : visibleRows.length === 0 ? (
            <Text variant="body">条件に一致する取引はありません。</Text>
          ) : (
            <>
            <Row gap="sm" align="center" justify="end">
              <Text variant="muted">{visibleRows.length}件ヒット</Text>
            </Row>
            <div className={styles.tableWrap}>
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>日付</TableHeaderCell>
                  <TableHeaderCell>年度</TableHeaderCell>
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
                {displayedRows.map((row) => {
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
                        <Select
                          className={styles.cellInput}
                          value={edit.fiscal_year}
                          onChange={(e) =>
                            handleEdit(row.id, { fiscal_year: Number(e.target.value) })
                          }
                          aria-label="割り当て年度"
                          title={
                            edit.fiscal_year !== Number(edit.date.slice(0, 4))
                              ? "日付の年とは違う年度に割り当てられています"
                              : undefined
                          }
                        >
                          {[...new Set([...yearOptions, edit.fiscal_year])]
                            .sort((a, b) => b - a)
                            .map((optionYear) => (
                              <option key={optionYear} value={optionYear}>
                                {optionYear}年
                              </option>
                            ))}
                        </Select>
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
                            disabledReason={busy ? "処理中です" : "変更がありません"}
                            onClick={() => void handleSave(row)}
                          >
                            保存
                          </Button>
                          <Button
                            variant={deleteArmedId === row.id ? "danger" : "ghost"}
                            size="sm"
                            disabled={busy}
                            disabledReason="処理中です"
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
            {totalPages > 1 ? (
              <Col gap="sm">
                <Row justify="end">
                  <Text variant="muted">
                    全{visibleRows.length}件中 {(currentPage - 1) * PAGE_SIZE + 1}–
                    {(currentPage - 1) * PAGE_SIZE + displayedRows.length}件目
                  </Text>
                </Row>
                <Row gap="sm" align="center" justify="center">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage <= 1}
                  disabledReason="最初のページです"
                  onClick={() => goToPage(currentPage - 1)}
                >
                  前へ
                </Button>
                {pageList(currentPage, totalPages).map((item, index) =>
                  item === "gap" ? (
                    <Text key={`gap-${index}`} variant="muted">
                      …
                    </Text>
                  ) : (
                    <Button
                      key={item}
                      variant={item === currentPage ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => goToPage(item)}
                    >
                      {item}
                    </Button>
                  ),
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  disabledReason="最後のページです"
                  onClick={() => goToPage(currentPage + 1)}
                >
                  次へ
                </Button>
                </Row>
              </Col>
            ) : null}
            </>
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
              <Text variant="statLabel">年度（割り当て）</Text>
              <Select
                value={draft.fiscal_year}
                onChange={(e) => setDraft({ ...draft, fiscal_year: Number(e.target.value) })}
              >
                {[...new Set([...yearOptions, draft.fiscal_year, Number(draft.date.slice(0, 4))])]
                  .filter((optionYear) => Number.isInteger(optionYear) && optionYear > 0)
                  .sort((a, b) => b - a)
                  .map((optionYear) => (
                    <option key={optionYear} value={optionYear}>
                      {optionYear}年
                    </option>
                  ))}
              </Select>
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
                <Button variant="primary" size="sm" disabled={busy} disabledReason="処理中です" onClick={() => void handleAdd()}>
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
  years,
  onChange,
  onRemove,
  bare = false,
}: {
  filter: LedgerFilter;
  /** 年度フィルターの選択肢（データにある割り当て年度）。 */
  years: readonly number[];
  onChange: (next: LedgerFilter) => void;
  /** 削除ボタン。無いフィルター（期間）は常設なので渡さない。 */
  onRemove?: () => void;
  /** 枠もラベルも付けない（検索の左に置く期間フィルター用）。 */
  bare?: boolean;
}) => {
  return (
    <div className={bare ? styles.filterBare : styles.filterChip}>
      {bare ? null : <Text variant="caption">{FILTER_FIELD_LABELS[filter.field]}</Text>}
      {filter.field === "year" ? (
        <Select
          className={styles.chipSelect}
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
          aria-label="年度で絞り込み"
        >
          <option value="">全年度</option>
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}年
            </option>
          ))}
          {filter.value && !years.includes(Number(filter.value)) ? (
            <option value={filter.value}>{filter.value}年</option>
          ) : null}
        </Select>
      ) : filter.field === "period" ? (
        <>
          <Input
            type="date"
            className={styles.chipInput}
            value={filter.from}
            onChange={(e) => onChange({ ...filter, from: e.target.value })}
            aria-label="開始日"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="date"
            className={styles.chipInput}
            value={filter.to}
            onChange={(e) => onChange({ ...filter, to: e.target.value })}
            aria-label="終了日"
          />
        </>
      ) : filter.field === "amount" ? (
        <>
          <Input
            type="number"
            className={styles.chipNumber}
            value={filter.min}
            onChange={(e) => onChange({ ...filter, min: e.target.value })}
            placeholder="最小"
            aria-label="金額（最小・符号付き）"
          />
          <Text variant="muted">〜</Text>
          <Input
            type="number"
            className={styles.chipNumber}
            value={filter.max}
            onChange={(e) => onChange({ ...filter, max: e.target.value })}
            placeholder="最大"
            aria-label="金額（最大・符号付き）"
          />
          <Text variant="muted">円</Text>
        </>
      ) : filter.field === "category" ? (
        <MultiSelectFilter
          ariaLabel="勘定科目で絞り込み"
          options={CATEGORY_OPTIONS.map((name) => ({ value: name, label: name }))}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      ) : filter.field === "incomeType" ? (
        <MultiSelectFilter
          ariaLabel="区分で絞り込み"
          options={INCOME_TYPE_OPTIONS}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      ) : filter.field === "mismatch" ? null : (
        <MultiSelectFilter
          ariaLabel="税区分で絞り込み"
          options={TAX_CATEGORY_OPTIONS}
          values={filter.values}
          onChange={(values) => onChange({ ...filter, values })}
        />
      )}
      {onRemove ? (
        <button
          type="button"
          className={styles.chipRemove}
          onClick={onRemove}
          aria-label={`${FILTER_FIELD_LABELS[filter.field]}フィルターを削除`}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
};

/** 取引がフィルター1件に一致するか。金額は符号付きで比べる（支出はマイナス）。 */
function matchesFilter(row: LedgerTransaction, filter: LedgerFilter): boolean {
  switch (filter.field) {
    case "year":
      return filter.value === "" || row.fiscal_year === Number(filter.value);
    case "period":
      return (!filter.from || row.date >= filter.from) && (!filter.to || row.date <= filter.to);
    case "amount": {
      const min = filter.min.trim() === "" ? null : Number(filter.min);
      const max = filter.max.trim() === "" ? null : Number(filter.max);
      if (min !== null && Number.isFinite(min) && row.amount < min) return false;
      if (max !== null && Number.isFinite(max) && row.amount > max) return false;
      return true;
    }
    case "category":
      return filter.values.length === 0 || filter.values.includes(row.category);
    case "incomeType":
      return filter.values.length === 0 || filter.values.includes(row.income_type);
    case "taxCategory":
      return filter.values.length === 0 || filter.values.includes(row.tax_category);
    case "mismatch":
      return taxCategorySignMismatch(row);
  }
}

/** URLクエリから検索・フィルターの初期状態を読む。不正な値は落とす。 */
function parseFiltersFromSearch(search: string): { query: string; filters: LedgerFilter[] } {
  const params = new URLSearchParams(search);
  // 期間フィルターは常設（消せない）。指定が無くても必ず先頭に入れる。
  if (params.get("filters") === null) {
    return { query: params.get("q") ?? "", filters: [emptyFilter("period")] };
  }
  const requested = (params.get("filters") ?? "")
    .split(",")
    .filter(
      (field, index, all) =>
        FILTER_FIELDS.includes(field as LedgerFilterField) && all.indexOf(field) === index,
    );
  const filters: LedgerFilter[] = requested.map((rawField) => {
    const field = rawField as LedgerFilterField;
    switch (field) {
      case "year": {
        const value = params.get("year") ?? "";
        return { field, value: /^\d{4}$/.test(value) ? value : "" };
      }
      case "period": {
        const from = params.get("from") ?? "";
        const to = params.get("to") ?? "";
        return {
          field,
          from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "",
          to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "",
        };
      }
      case "amount":
        return { field, min: params.get("amin") ?? "", max: params.get("amax") ?? "" };
      case "category":
        return { field, values: params.getAll("cat") };
      case "incomeType":
        return { field, values: params.getAll("itype") };
      case "taxCategory":
        return { field, values: params.getAll("tax") };
      case "mismatch":
        return { field };
    }
  });
  if (!filters.some((f) => f.field === "period")) {
    filters.unshift(emptyFilter("period"));
  }
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
        case "year":
          if (filter.value) params.set("year", filter.value);
          break;
        case "period":
          if (filter.from) params.set("from", filter.from);
          if (filter.to) params.set("to", filter.to);
          break;
        case "amount":
          if (filter.min) params.set("amin", filter.min);
          if (filter.max) params.set("amax", filter.max);
          break;
        case "category":
          for (const value of filter.values) params.append("cat", value);
          break;
        case "incomeType":
          for (const value of filter.values) params.append("itype", value);
          break;
        case "taxCategory":
          for (const value of filter.values) params.append("tax", value);
          break;
        case "mismatch":
          break;
      }
    }
  }
  return params.toString();
}

const CSV_HEADER: readonly string[] = [
  "日付",
  "年度",
  "摘要",
  "金額",
  "勘定科目",
  "区分",
  "税区分",
  "出所",
];

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** 表示中の取引をCSVでダウンロードする。Excelで開けるようBOMを付ける。 */
function downloadLedgerCsv(rows: LedgerTransaction[], label: string): void {
  const lines = rows.map((row) =>
    [
      row.date,
      row.fiscal_year,
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
  anchor.download = `ledger-${label}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
