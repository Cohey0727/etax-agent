import { useState } from "react";
import { Button, Card, Col, Icon, Input, Row, Text } from "@components/atoms";
import { AppView } from "@types";
import { FilterChip } from "./FilterChip";
import {
  FILTER_FIELD_LABELS,
  FILTER_FIELDS,
  LedgerFilter,
  LedgerFilterField,
} from "./ledgerFilters";
import styles from "./LedgerPanel.css";

/**
 * LedgerToolbar.tsx — 帳簿画面の見出し・集計・検索・フィルター行。
 * ドロップダウンメニューの開閉はこの部品の中で閉じる（表示だけの状態）。
 */
export const LedgerToolbar = ({
  stats,
  downloading,
  query,
  filters,
  periodFilter,
  otherFilters,
  yearOptions,
  onDownloadPdf,
  onDownloadCsv,
  onOpenHistory,
  onIntakeNavigate,
  onManualAdd,
  onQueryChange,
  onFilterChange,
  onFilterRemove,
  onAddFilter,
  onClearFilters,
}: {
  stats: readonly { label: string; value: string }[];
  downloading: boolean;
  query: string;
  filters: readonly LedgerFilter[];
  periodFilter: LedgerFilter | undefined;
  otherFilters: readonly LedgerFilter[];
  yearOptions: readonly number[];
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
  onOpenHistory: () => void;
  onIntakeNavigate: (view: AppView) => void;
  onManualAdd: () => void;
  onQueryChange: (query: string) => void;
  onFilterChange: (next: LedgerFilter) => void;
  onFilterRemove: (field: LedgerFilterField) => void;
  onAddFilter: (field: LedgerFilterField) => void;
  onClearFilters: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  return (
    <Col gap="md">
      <Row gap="md" align="center" justify="spaceBetween">
        <Text variant="sectionTitle">帳簿</Text>
        <Row gap="md" align="center">
          <Button variant="ghost" size="sm" onClick={onOpenHistory}>
            訂正・削除履歴
          </Button>
          <div className={styles.addMenuWrap}>
            <Button
              variant="ghost"
              size="sm"
              disabled={downloading}
              disabledReason="ダウンロード中です"
              onClick={() => {
                setMenuOpen(false);
                setDownloadMenuOpen((open) => !open);
              }}
            >
              ダウンロード
              <Icon name="chevronDown" size={15} />
            </Button>
            {downloadMenuOpen ? (
              <>
                <div className={styles.menuBackdrop} onClick={() => setDownloadMenuOpen(false)} />
                <div className={styles.addMenu} role="menu">
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setDownloadMenuOpen(false);
                      onDownloadPdf();
                    }}
                  >
                    <Icon name="bill" size={16} />
                    PDFでダウンロード
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setDownloadMenuOpen(false);
                      onDownloadCsv();
                    }}
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
                setDownloadMenuOpen(false);
                setMenuOpen((open) => !open);
              }}
            >
              <Icon name="plus" size={15} />
              追加
              <Icon name="chevronDown" size={15} />
            </Button>
            {menuOpen ? (
              <>
                <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
                <div className={styles.addMenu} role="menu">
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onIntakeNavigate(AppView.Receipt);
                    }}
                  >
                    <Icon name="receipt" size={16} />
                    写真から
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onIntakeNavigate(AppView.Import);
                    }}
                  >
                    <Icon name="import" size={16} />
                    CSVから
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onManualAdd();
                    }}
                  >
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
            <FilterChip bare filter={periodFilter} years={yearOptions} onChange={onFilterChange} />
          ) : null}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <Icon name="search" size={16} />
            </span>
            <Input
              className={styles.searchInput}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="取引先・摘要・科目・出所で検索"
              aria-label="取引を検索"
            />
          </div>
        </Row>
        {/* クリアは常時表示。条件が無ければ押しても何も起きない。 */}
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          クリア
        </Button>
      </Row>
      <Row gap="sm" align="center" wrap>
        {otherFilters.map((filter) => (
          <FilterChip
            key={filter.field}
            filter={filter}
            years={yearOptions}
            onChange={onFilterChange}
            onRemove={() => onFilterRemove(filter.field)}
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
                {FILTER_FIELDS.filter((field) => !filters.some((f) => f.field === field)).map(
                  (field) => (
                    <button
                      key={field}
                      type="button"
                      className={styles.menuItem}
                      onClick={() => {
                        setFilterMenuOpen(false);
                        onAddFilter(field);
                      }}
                    >
                      {FILTER_FIELD_LABELS[field]}
                    </button>
                  ),
                )}
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
    </Col>
  );
};
