import { Transaction } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import { Col, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AppView } from "@types";
import { downloadLedgerPdf } from "@utils/api";
import { formatYen } from "@utils/format";
import { LedgerAddForm } from "./LedgerAddForm";
import { LedgerSkeleton } from "./LedgerSkeleton";
import { LedgerTable } from "./LedgerTable";
import { LedgerToolbar } from "./LedgerToolbar";
import { downloadLedgerCsv } from "./ledgerCsv";
import {
  activeYearOf,
  buildFilterSearch,
  emptyFilter,
  filterRows,
  LedgerFilter,
  LedgerFilterField,
  parseFiltersFromSearch,
} from "./ledgerFilters";
import { PAGE_SIZE } from "./ledgerOptions";
import { useLedgerData } from "./useLedgerData";

export interface LedgerPanelProps {
  /** 帳簿の変更をアプリ全体の取引へ反映する（メモリのみ・遷移なし）。 */
  onSyncTransactions?: (transactions: Transaction[]) => void;
  /** 取込系の画面への遷移（「追加」ドロップダウンの写真から・CSVから使う）。 */
  onNavigate?: (view: AppView) => void;
}

export const LedgerPanel = ({ onSyncTransactions, onNavigate }: LedgerPanelProps) => {
  const {
    status,
    rows,
    edits,
    draft,
    setDraft,
    deleteArmedId,
    error,
    setError,
    busy,
    isDirty,
    handleEdit,
    handleSave,
    handleDelete,
    handleAdd,
  } = useLedgerData(onSyncTransactions);
  const [downloading, setDownloading] = useState(false);
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

  // 検索・フィルターの状態をURLクエリへ反映する（履歴は汚さない）。
  useEffect(() => {
    const qs = buildFilterSearch(query, filters);
    const current = window.location.pathname + window.location.search;
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== current) window.history.replaceState(null, "", next);
  }, [query, filters]);

  const addFilter = (field: LedgerFilterField) => {
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

  const handleManualAdd = () => {
    setAddFormOpen(true);
    // フォームは表の下に開くので、開いたらそこまでスクロールする。
    window.setTimeout(() => {
      addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const handleDownloadPdf = async () => {
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
    try {
      const csvYear = activeYearOf(filters);
      downloadLedgerCsv(filterRows(rows, query, filters), csvYear ? String(csvYear) : "all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSVのダウンロードに失敗しました");
    }
  };

  if (status === "loading") {
    // 読み込み中は、実際のレイアウトと同じ形のスケルトンを出す。
    return <LedgerSkeleton />;
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
      <LedgerToolbar
        stats={stats}
        downloading={downloading}
        query={query}
        filters={filters}
        periodFilter={periodFilter}
        otherFilters={otherFilters}
        yearOptions={yearOptions}
        onDownloadPdf={() => void handleDownloadPdf()}
        onDownloadCsv={handleDownloadCsv}
        onIntakeNavigate={(view) => onNavigate?.(view)}
        onManualAdd={handleManualAdd}
        onQueryChange={setQuery}
        onFilterChange={updateFilter}
        onFilterRemove={removeFilter}
        onAddFilter={addFilter}
        onClearFilters={clearFilters}
      />
      {rows.length === 0 ? (
        <Text variant="body">
          まだ取引がありません。右上の「追加」ボタンから追加するか、CSV取込・領収書から
          取り込むと自動で帳簿に保存されます。
        </Text>
      ) : visibleRows.length === 0 ? (
        <Text variant="body">条件に一致する取引はありません。</Text>
      ) : (
        <LedgerTable
          displayedRows={displayedRows}
          edits={edits}
          yearOptions={yearOptions}
          busy={busy}
          deleteArmedId={deleteArmedId}
          visibleCount={visibleRows.length}
          currentPage={currentPage}
          totalPages={totalPages}
          isDirty={isDirty}
          onEdit={handleEdit}
          onSave={(row) => void handleSave(row)}
          onDelete={(row) => void handleDelete(row)}
          onPageChange={goToPage}
        />
      )}
      {addFormOpen ? (
        <LedgerAddForm
          draft={draft}
          yearOptions={yearOptions}
          busy={busy}
          formRef={addFormRef}
          onDraftChange={setDraft}
          onAdd={() => void handleAdd()}
          onClose={() => setAddFormOpen(false)}
        />
      ) : null}
    </Col>
  );
};
