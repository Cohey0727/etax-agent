import { ReactNode } from "react";
import { clsx } from "clsx";
import { Badge, Button, Col, Icon, IconName, Row, Select, Text } from "@components/atoms";
import { Tabs } from "@components/molecules";
import { AppView } from "@types";
import styles from "./AppTemplate.css";

export interface AppTemplateProps {
  views: readonly { id: AppView; label: string; icon: IconName }[];
  activeView: AppView;
  years: readonly number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  dataSource: string;
  transactionCount: number;
  agentOpen: boolean;
  onToggleAgent: () => void;
  onCloseAgent: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
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
  agentOpen,
  onToggleAgent,
  onCloseAgent,
  darkMode,
  onToggleDarkMode,
  agentPanel,
  onViewChange,
  children,
}: AppTemplateProps) => {
  const activeLabel = views.find((view) => view.id === activeView)?.label ?? "";
  return (
    <Row gap="none" align="start" className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          <Row gap="sm" align="center">
            <div className={styles.brandMark}>e</div>
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
          <Tabs items={views} activeId={activeView} onChange={onViewChange} orientation="vertical" />
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
      </aside>
      <main className={styles.main}>
        <div className={styles.mainInner}>
          <Col gap="lg">
            <Row gap="md" align="center" justify="spaceBetween">
              <Text variant="title">{activeLabel}</Text>
              <Row gap="sm" align="center">
                <Badge>下書き・準備専用</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggleDarkMode}
                  aria-label={darkMode ? "ライトモードに切り替え" : "ダークモードに切り替え"}
                >
                  <Icon name={darkMode ? "sun" : "moon"} size={16} />
                </Button>
                <Button variant="primary" size="sm" onClick={onToggleAgent}>
                  <Icon name="agent" size={16} />
                  エージェント
                </Button>
              </Row>
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
      <div
        className={clsx(styles.scrim, agentOpen && styles.scrimOpen)}
        onClick={onCloseAgent}
        aria-hidden="true"
      />
      <aside
        className={clsx(styles.drawer, agentOpen && styles.drawerOpen)}
        aria-hidden={!agentOpen}
      >
        <div className={styles.drawerInner}>
          <Row gap="md" align="center" justify="spaceBetween">
            <Text variant="sectionTitle">エージェント</Text>
            <Button variant="ghost" size="sm" onClick={onCloseAgent} aria-label="エージェントを閉じる">
              <Icon name="close" size={16} />
            </Button>
          </Row>
          <div className={styles.drawerBody}>{agentPanel}</div>
        </div>
      </aside>
    </Row>
  );
};
