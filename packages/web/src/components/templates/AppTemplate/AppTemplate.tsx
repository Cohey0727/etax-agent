import { ReactNode } from "react";
import { Col, Text } from "@components/atoms";
import { Tabs } from "@components/molecules";
import { AppView } from "@types";
import styles from "./AppTemplate.css";

export interface AppTemplateProps {
  views: readonly { id: AppView; label: string }[];
  activeView: AppView;
  dataSource: string;
  transactionCount: number;
  onViewChange: (view: AppView) => void;
  children?: ReactNode;
}

export const AppTemplate = ({
  views,
  activeView,
  dataSource,
  transactionCount,
  onViewChange,
  children,
}: AppTemplateProps) => {
  return (
    <div className={styles.shell}>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="title">eTaxAgent</Text>
          <Text variant="muted">
            個人事業主向け確定申告「準備」ツール — 集計・消費税計算・修正申告の差分を、
            決定的な計算エンジンとLLMエージェントで支援します。表示中のデータ: {dataSource}（
            {transactionCount}件）
          </Text>
        </Col>
        <Tabs items={views} activeId={activeView} onChange={onViewChange} />
        {children}
        <div className={styles.footer}>
          <Text variant="caption">
            本ツールは計算と下書きの準備専用です。e-Tax への最終提出は納税者本人が行ってください
            （税務代理は税理士の独占業務です）。表示される金額は概算を含むため、
            実際の申告前に税務署・税理士への確認を推奨します。
          </Text>
        </div>
      </Col>
    </div>
  );
};
