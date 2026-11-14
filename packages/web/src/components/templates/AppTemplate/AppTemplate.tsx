import { ReactNode, useState } from "react";
import { clsx } from "clsx";
import { Badge, Button, Col, Icon, IconName, Row, Select, Text } from "@components/atoms";
import { Tabs } from "@components/molecules";
import { AppView } from "@types";
import styles from "./AppTemplate.css";

export interface AppTemplateProps {
  /** 全画面の登録。nav が false の画面はサイドバーに出さず、他画面からの遷移専用。 */
  views: readonly { id: AppView; label: string; icon: IconName; nav: boolean }[];
  activeView: AppView;
  years: readonly number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  dataSource: string;
  transactionCount: number;
  agentPanel: ReactNode;
  onViewChange: (view: AppView) => void;
  children?: ReactNode;
}

export const AppTemplate = ({
  views,
  activeView,
  years,
  selectedYear,
  onYearChange,
  dataSource,
  transactionCount,
  agentPanel,
  onViewChange,
  children,
}: AppTemplateProps) => {
  // 左右パネルの開閉はレイアウト側の状態（下部アクションバーとヘッダから切り替える）。
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const activeLabel = views.find((view) => view.id === activeView)?.label ?? "";
  const navViews = views.filter((view) => view.nav);
  return (
    <div className={styles.root}>
      <Row gap="none" align="start" className={styles.shell}>
        <aside className={clsx(styles.sidebar, !sidebarOpen && styles.sidebarClosed)}>
          {sidebarOpen ? (
            <div className={styles.sidebarInner}>
              <Row gap="sm" align="center">
                <div className={styles.brandMark}>
                  <Icon name="bill" size={21} />
                </div>
                <Col gap="sm">
                  <Text variant="sectionTitle">eTaxAgent</Text>
                  <Text variant="caption">確定申告 準備ツール</Text>
                </Col>
              </Row>
              <Col gap="sm">
                <Text variant="statLabel">年度</Text>
                <Select
                  className={styles.yearSelect}
                  value={selectedYear}
                  onChange={(e) => onYearChange(Number(e.target.value))}
                  aria-label="年度"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}年
                    </option>
                  ))}
                </Select>
              </Col>
              <Tabs items={navViews} activeId={activeView} onChange={onViewChange} orientation="vertical" />
              <div className={styles.spacer} />
              <div className={styles.dataPanel}>
                <Col gap="sm">
                  <Text variant="statLabel">表示中のデータ</Text>
                  <Text variant="body">
                    {dataSource}（{transactionCount}件）
                  </Text>
                </Col>
              </div>
            </div>
          ) : (
            <div className={styles.railInner}>
              <div className={styles.brandMark}>
                <Icon name="bill" size={21} />
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
                <Badge>下書き・準備専用</Badge>
              </Row>
              <div key={activeView} className={styles.view}>
                {children}
              </div>
              <div className={styles.footer}>
                <Text variant="caption">
                  本ツールは計算と下書きの準備専用です。e-Tax への最終提出は納税者本人が行ってください
                  （税務代理は税理士の独占業務です）。表示される金額は概算を含むため、
                  実際の申告前に税務署・税理士への確認を推奨します。
                </Text>
              </div>
            </Col>
          </div>
        </main>
        <aside
          className={clsx(styles.agentPanel, agentPanelOpen && styles.agentPanelOpen)}
          aria-hidden={!agentPanelOpen}
        >
          <div className={styles.panelInner}>
            <Row gap="md" align="center" justify="spaceBetween">
              <Text variant="sectionTitle">エージェント</Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAgentPanelOpen(false)}
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
          <Button
            variant={sidebarOpen ? "tabActive" : "ghost"}
            size="sm"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-pressed={sidebarOpen}
            aria-label="メニュー（左サイドバー）の開閉"
          >
            <Icon name="panelLeft" size={17} />
          </Button>
          <Button
            variant={agentPanelOpen ? "tabActive" : "ghost"}
            size="sm"
            onClick={() => setAgentPanelOpen((open) => !open)}
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
