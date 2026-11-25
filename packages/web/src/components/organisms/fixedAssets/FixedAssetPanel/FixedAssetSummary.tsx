import { Card, Col, Row, Text } from "@components/atoms";
import { DepreciationSummary, FixedAssetRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./FixedAssetPanel.css";
import { bookValueAt, disposedYearOf } from "./fixedAssetOptions";

export interface FixedAssetSummaryProps {
  assets: FixedAssetRecord[];
  summary: DepreciationSummary | null;
  year: number;
}

/** 対象年度のサマリ帯（件数・取得価額・償却費・期末簿価・少額特例の使用状況）。 */
export const FixedAssetSummary = ({ assets, summary, year }: FixedAssetSummaryProps) => {
  const active = assets.filter((asset) => {
    const disposedYear = disposedYearOf(asset);
    return disposedYear === null || disposedYear >= year;
  });
  const disposedCount = assets.length - active.length;
  const totalCost = active.reduce((sum, asset) => sum + asset.cost, 0);
  const totalBookValue = active.reduce((sum, asset) => sum + bookValueAt(asset, year), 0);
  const businessDeductible = summary?.deductible_totals.business ?? 0;
  const realEstateDeductible = summary?.deductible_totals.real_estate ?? 0;
  const smallSpecial = summary?.small_special ?? null;
  const smallSpecialPercent = smallSpecial
    ? Math.min(100, (smallSpecial.total / smallSpecial.cap) * 100)
    : 0;

  const stats: readonly { label: string; value: string }[] = [
    {
      label: "資産件数",
      value: disposedCount > 0 ? `${active.length}件（除却済み${disposedCount}件）` : `${active.length}件`,
    },
    { label: "取得価額 合計", value: formatYen(totalCost) },
    { label: `${year}年の償却費（事業）`, value: formatYen(businessDeductible) },
    { label: `${year}年の償却費（不動産）`, value: formatYen(realEstateDeductible) },
    { label: `${year}年末の未償却残高`, value: formatYen(totalBookValue) },
  ];

  return (
    <Col gap="md">
      <div className={styles.statGrid}>
        {stats.map((stat) => (
          <Card key={stat.label}>
            <Col gap="sm">
              <Text variant="statLabel">{stat.label}</Text>
              <Text variant="statValue">{stat.value}</Text>
            </Col>
          </Card>
        ))}
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
