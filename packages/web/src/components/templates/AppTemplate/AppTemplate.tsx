import { Fragment, ReactNode, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Button, Col, Icon, IconName, Logo, Row, Select, Text } from "@components/atoms";
import { AppView } from "@types";
import styles from "./AppTemplate.css";
import {
  AGENT_OPEN_KEY,
  SIDEBAR_OPEN_KEY,
  loadPanelOpen,
  savePanelOpen,
  useMediaQuery,
  yearSelectOptions,
} from "./appTemplateUtils";

export interface AppTemplateProps<NavChildKey extends string> {
  /** 全画面の登録。nav が false の画面はサイドバーに出さず、他画面からの遷移専用。 */
  views: readonly { id: AppView; label: string; icon: IconName; nav: boolean }[];
  activeView: AppView;
  years: readonly number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  /** 取引がまだ無い年度を追加する（追加と同時にその年度へ切り替わる）。 */
  onAddYear?: (year: number) => void;
  dataSource: string;
  transactionCount: number;
  agentPanel: ReactNode;
  /** エージェント見出しの右に置く追加ボタン（履歴ボタンなど）。 */
  agentHeaderExtra?: ReactNode;
  onViewChange: (view: AppView) => void;
  /** 画面にぶら下がる子項目（サイドバーのネスト表示。確定申告のタブなど）。 */
  navChildren?: readonly { view: AppView; key: NavChildKey; label: string }[];
  /** 選択中の子項目の key。親画面がアクティブなときだけハイライトする。 */
  activeNavChildKey?: NavChildKey | null;
  onNavChildSelect?: (view: AppView, key: NavChildKey) => void;
  children?: ReactNode;
}

export const AppTemplate = <NavChildKey extends string>({
  views,
  activeView,
  years,
  selectedYear,
  onYearChange,
  onAddYear,
  dataSource,
  transactionCount,
  agentPanel,
  agentHeaderExtra,
  onViewChange,
  navChildren,
  activeNavChildKey,
  onNavChildSelect,
  children,
}: AppTemplateProps<NavChildKey>) => {
  // 年度の追加はセレクタの中の選択肢で行う（最大年度+1 / 最小年度-1）。
  const yearOptions = yearSelectOptions(years, selectedYear);
  const handleYearSelect = (raw: string) => {
    if (raw.startsWith("add:")) {
      onAddYear?.(Number(raw.slice("add:".length)));
    } else {
      onYearChange(Number(raw));
    }
  };
  // 左右パネルの開閉はレイアウト側の状態で、端末に保存して次回も引き継ぐ。
  // ただし狭い画面ではサイドバーが上部を占有するので、保存値によらず閉じた状態から始める
  // （下部バーのボタンでいつでも開ける。開閉の保存はデスクトップ幅でのみ効く）。
  const [sidebarOpen, setSidebarOpen] = useState(
    () =>
      loadPanelOpen(SIDEBAR_OPEN_KEY, true) &&
      !(typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches),
  );
  const [agentPanelOpen, setAgentPanelOpen] = useState(
    () =>
      loadPanelOpen(AGENT_OPEN_KEY, false) &&
      !(typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches),
  );

  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    savePanelOpen(SIDEBAR_OPEN_KEY, next);
  };
  const toggleAgentPanel = () => {
    const next = !agentPanelOpen;
    setAgentPanelOpen(next);
    savePanelOpen(AGENT_OPEN_KEY, next);
  };
  const activeLabel = views.find((view) => view.id === activeView)?.label ?? "";
  const navViews = views.filter((view) => view.nav);
  // 狭い画面ではサイドバーはドロワーになる（初期は閉じる／遷移したら閉じる）。
  const isNarrow = useMediaQuery("(max-width: 900px)");
  const handleViewChange = (view: AppView) => {
    onViewChange(view);
    if (isNarrow) setSidebarOpen(false);
  };
  const handleNavChildSelect = (view: AppView, key: NavChildKey) => {
    onNavChildSelect?.(view, key);
    if (isNarrow) setSidebarOpen(false);
  };
  return (
    <div className={styles.root}>
      <Row gap="none" align="start" className={styles.shell}>
        {isNarrow && sidebarOpen ? (
          <div className={styles.backdrop} onClick={toggleSidebar} aria-hidden="true" />
        ) : null}
        <aside className={clsx(styles.sidebar, !sidebarOpen && styles.sidebarClosed)}>
          {sidebarOpen || isNarrow ? (
            <div className={styles.sidebarInner}>
              <Row gap="sm" align="center">
                <div className={styles.brandMark}>
                  <Logo variant="icon" size={40} />
                </div>
                <Col gap="none">
                  <Text variant="sectionTitle" className={styles.brandTitle}>
                    eTaxAgent
                  </Text>
                  <Text variant="caption" className={styles.brandCaption}>
                    確定申告 準備ツール
                  </Text>
                </Col>
              </Row>
              <Col gap="sm">
                {navViews.map((view) => {
                  const children = (navChildren ?? []).filter(
                    (child) => child.view === view.id,
                  );
                  return (
                    <Fragment key={view.id}>
                      {view.id === AppView.Filing ? (
                        <Col gap="sm">
                          <Text variant="statLabel" className={styles.dataLabel}>
                            年度
                          </Text>
                          <Select
                            className={styles.yearSelect}
                            value={selectedYear}
                            onChange={(e) => handleYearSelect(e.target.value)}
                            aria-label="年度"
                          >
                            {onAddYear ? (
                              <option value={`add:${yearOptions.nextYear}`}>
                                {yearOptions.nextYear}年度を追加
                              </option>
                            ) : null}
                            {yearOptions.years.map((year) => (
                              <option key={year} value={year}>
                                {year}年度
                              </option>
                            ))}
                            {onAddYear ? (
                              <option value={`add:${yearOptions.prevYear}`}>
                                {yearOptions.prevYear}年度を追加
                              </option>
                            ) : null}
                          </Select>
                        </Col>
                      ) : null}
                      <Button
                        variant={view.id === activeView ? "navActive" : "nav"}
                        size="md"
                        onClick={() => handleViewChange(view.id)}
                      >
                        <Icon name={view.icon} />
                        {view.label}
                      </Button>
                      {children.length > 0 ? (
                        <div className={styles.navChildren}>
                          <Col gap="sm">
                            {children.map((child) => (
                              <Button
                                key={child.key}
                                variant={
                                  view.id === activeView && child.key === activeNavChildKey
                                    ? "navActive"
                                    : "nav"
                                }
                                size="sm"
                                onClick={() => handleNavChildSelect(view.id, child.key)}
                              >
                                {child.label}
                              </Button>
                            ))}
                          </Col>
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Col>
              <div className={styles.spacer} />
              <div className={styles.dataPanel}>
                <Col gap="sm">
                  <Text variant="statLabel" className={styles.dataLabel}>
                    表示中のデータ
                  </Text>
                  <Text variant="body" className={styles.dataText}>
                    {dataSource}（{transactionCount}件）
                  </Text>
                </Col>
              </div>
            </div>
          ) : (
            <div className={styles.railInner}>
              <div className={styles.brandMark}>
                <Logo variant="icon" size={40} />
              </div>
              <div className={styles.railNav}>
                {navViews.map((view) => (
                  <Button
                    key={view.id}
                    variant={view.id === activeView ? "navActive" : "nav"}
                    size="sm"
                    onClick={() => onViewChange(view.id)}
                    title={view.label}
                    aria-label={view.label}
                    aria-current={view.id === activeView ? "page" : undefined}
                  >
                    <Icon name={view.icon} size={19} />
                  </Button>
                ))}
              </div>
            </div>
          )}
        </aside>
        <main className={styles.main}>
          <div className={styles.mainInner}>
            <Col gap="lg">
              <Row gap="md" align="center" justify="spaceBetween">
                <Text variant="title">{activeLabel}</Text>
              </Row>
              <div key={activeView} className={styles.view}>
                {children}
              </div>
            </Col>
          </div>
        </main>
        {isNarrow && agentPanelOpen ? (
          <div className={styles.backdrop} onClick={toggleAgentPanel} aria-hidden="true" />
        ) : null}
        <aside
          className={clsx(styles.agentPanel, agentPanelOpen && styles.agentPanelOpen)}
          aria-hidden={!agentPanelOpen}
        >
          <div className={styles.panelInner}>
            <Row gap="md" align="center" justify="spaceBetween">
              <Row gap="sm" align="center">
                <Text variant="sectionTitle">エージェント</Text>
                {agentHeaderExtra}
              </Row>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleAgentPanel}
                aria-label="エージェントパネルを閉じる"
              >
                <Icon name="close" size={16} />
              </Button>
            </Row>
            <div className={styles.panelBody}>{agentPanel}</div>
          </div>
        </aside>
      </Row>
      <footer className={styles.actionBar}>
        <Row gap="sm" align="center" justify="spaceBetween" className={styles.barInner}>
          <Row gap="sm" align="center">
            <Button
              variant={sidebarOpen ? "tabActive" : "tab"}
              size="sm"
              onClick={toggleSidebar}
              aria-pressed={sidebarOpen}
              aria-label="メニュー（左サイドバー）の開閉"
            >
              <Icon name="panelLeft" size={17} />
            </Button>
          </Row>
          <Button
            variant={agentPanelOpen ? "tabActive" : "tab"}
            size="sm"
            onClick={toggleAgentPanel}
            aria-pressed={agentPanelOpen}
            aria-label="エージェントパネルの開閉"
          >
            <Icon name="panelRight" size={17} />
          </Button>
        </Row>
      </footer>
    </div>
  );
};
