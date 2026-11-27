import { summarizeFixedAssets } from "@etax/shared";
import { ReactNode } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { DepreciationSummary, FixedAssetRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./FixedAssetPanel.css";

export interface FixedAssetSummaryProps {
  assets: FixedAssetRecord[];
  summary: DepreciationSummary | null;
  year: number;
}

/** 対象年度のサマリ帯（件数・取得価額・償却費・期末簿価・少額特例の使用状況）。 */
export const FixedAssetSummary = ({ assets, summary, year }: FixedAssetSummaryProps) => {
  const { count, disposedCount, totalCost, totalBookValue } = summarizeFixedAssets(assets, year);
  const businessDeductible = summary?.deductible_totals.business ?? 0;
  const realEstateDeductible = summary?.deductible_totals.real_estate ?? 0;
  const agricultureDeductible = summary?.deductible_totals.agriculture ?? 0;
  const smallSpecial = summary?.small_special ?? null;
  const smallSpecialPercent = smallSpecial
    ? Math.min(100, (smallSpecial.total / smallSpecial.cap) * 100)
    : 0;


  return (
    <Col gap="md">
      <div className={styles.statGrid}>
        <FixedAssetStatCard label="資産件数">
          {count}件{disposedCount > 0 ? `（除却済み${disposedCount}件）` : ""}
        </FixedAssetStatCard>
        <FixedAssetStatCard label="取得価額 合計">{formatYen(totalCost)}</FixedAssetStatCard>
        <FixedAssetStatCard label={`${year}年の償却費（事業）`}>
          {formatYen(businessDeductible)}
        </FixedAssetStatCard>
        <FixedAssetStatCard label={`${year}年の償却費（不動産）`}>
          {formatYen(realEstateDeductible)}
        </FixedAssetStatCard>
        <FixedAssetStatCard label={`${year}年の償却費（農業）`}>
          {formatYen(agricultureDeductible)}
        </FixedAssetStatCard>
        <FixedAssetStatCard label={`${year}年末の未償却残高`}>
          {formatYen(totalBookValue)}
        </FixedAssetStatCard>
      </div>
      {smallSpecial ? (
        <Card>
          <Col gap="sm">
            <Row justify="spaceBetween" align="center">
              <Text variant="statLabel">少額減価償却資産の特例（{year}年取得分）</Text>
              <Text variant="body">
                {formatYen(smallSpecial.total)} / {formatYen(smallSpecial.cap)}
                {smallSpecial.exceeded ? "（上限を超過しています）" : ""}
              </Text>
            </Row>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.progressFill} ${smallSpecial.exceeded ? styles.progressFillExceeded : ""}`}
                style={{ width: `${smallSpecialPercent}%` }}
              />
            </div>
          </Col>
        </Card>
      ) : null}
    </Col>
  );
};

const FixedAssetStatCard = ({ label, children }: { label: string; children: ReactNode }) => (
  <Card>
    <Col gap="sm">
      <Text variant="statLabel">{label}</Text>
      <Text variant="statValue">{children}</Text>
    </Col>
  </Card>
);
