import { Card, Col, Row, SkeletonBar, Text } from "@components/atoms";
import styles from "./DashboardSkeleton.css";

/** 推移グラフの棒の高さ（売上・経費・収支、年度の古い順）。実データの傾向に近い形にする。 */
const TREND_BAR_HEIGHTS: readonly (readonly number[])[] = [
  [112, 44, 68],
  [86, 62, 24],
  [118, 48, 70],
  [104, 30, 74],
];
const TREND_YEARS: readonly string[] = ["2023年", "2024年", "2025年", "2026年"];
const TREND_LEGEND: readonly string[] = ["売上", "経費", "収支"];
const TREND_TABLE_ROWS: readonly number[] = [1, 2, 3, 4];
const STATUS_LABELS: readonly string[] = ["帳簿", "収支", "控除・計算"];
const STAT_CARD_TITLES: readonly string[] = ["事業所得", "不動産所得", "青色申告特別控除"];
const STAT_VALUE_WIDTHS: readonly string[] = ["62%", "48%", "70%", "56%"];
const TAX_BAR_WIDTHS: readonly string[] = ["64%", "40%", "22%"];
const BREAKDOWN_TITLES: readonly string[] = ["収入の内訳", "支出の内訳"];
const LEGEND_ROWS: readonly number[] = [1, 2, 3, 4];
const TRIAL_ROWS: readonly number[] = [1, 2, 3, 4, 5];

export interface DashboardSkeletonProps {
  year: number;
}

/**
 * ダッシュボードの読み込み中スケルトン。本物の並び（推移グラフ→申告ステータス→
 * 所得サマリー→消費税比較→内訳ドーナツ→損益計算書）を同じ形で再現し、
 * 出現時のレイアウトシフトと「別物が出た」感をなくす。見出しや項目名は
 * 実データと同じ文言をそのまま出す（FilingStatusPanel のスケルトンと同じ方針）。
 */
export const DashboardSkeleton = ({ year }: DashboardSkeletonProps) => {
  return (
    <Col gap="md">
      <TrendSkeleton />
      <FilingStatusSkeleton year={year} />
      <SummarySkeleton year={year} />
      <BreakdownSkeleton year={year} />
      <TrialBalanceSkeleton year={year} />
    </Col>
  );
};

const TrendSkeleton = () => (
  <Card>
    <Col gap="md">
      <Row gap="md" align="center" justify="spaceBetween" wrap>
        <Text variant="sectionTitle">年度ごとの推移</Text>
        <Row gap="md" align="center">
          {TREND_LEGEND.map((label) => (
            <Row key={label} gap="sm" align="center">
              <SkeletonBar width="12px" height={12} radius={3} />
              <Text variant="muted">{label}</Text>
            </Row>
          ))}
        </Row>
      </Row>
      <div aria-hidden="true">
        <div className={styles.chart}>
          {TREND_BAR_HEIGHTS.map((group, groupIndex) => (
            <div key={groupIndex} className={styles.chartGroup}>
              {group.map((height, barIndex) => (
                <div key={barIndex} className={styles.barCol}>
                  <SkeletonBar width="26px" height={9} />
                  <SkeletonBar width="30px" height={height} radius={4} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.yearRow}>
          {TREND_YEARS.map((label) => (
            <div key={label} className={styles.yearCell}>
              <Text variant="muted">{label}</Text>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true">
        <div className={styles.tableRow}>
          <SkeletonBar width="36px" height={12} />
          <div className={styles.tableCellRight}>
            <SkeletonBar width="36px" height={12} />
          </div>
          <div className={styles.tableCellRight}>
            <SkeletonBar width="36px" height={12} />
          </div>
          <div className={styles.tableCellRight}>
            <SkeletonBar width="36px" height={12} />
          </div>
        </div>
        {TREND_TABLE_ROWS.map((row) => (
          <div key={row} className={styles.tableRow}>
            <SkeletonBar width="44px" height={14} />
            <div className={styles.tableCellRight}>
              <SkeletonBar width="84px" height={14} />
            </div>
            <div className={styles.tableCellRight}>
              <SkeletonBar width="72px" height={14} />
            </div>
            <div className={styles.tableCellRight}>
              <SkeletonBar width="84px" height={14} />
            </div>
          </div>
        ))}
      </div>
    </Col>
  </Card>
);

const FilingStatusSkeleton = ({ year }: { year: number }) => (
  <Card>
    <Col gap="md">
      <Col gap="sm">
        <Text variant="sectionTitle">申告ステータス — {year}年分</Text>
        <Text variant="muted">
          収支と控除・計算の進捗表示です。ステータスの変更は確定申告画面で行います。
          提出は e-Tax で行います。
        </Text>
      </Col>
      <Col gap="sm" aria-hidden="true">
        {STATUS_LABELS.map((label) => (
          <Row key={label} gap="md" align="center">
            <Text>{label}</Text>
            <SkeletonBar width="64px" height={12} />
          </Row>
        ))}
      </Col>
      <SkeletonBar width="190px" height={32} radius={10} />
    </Col>
  </Card>
);

const SummarySkeleton = ({ year }: { year: number }) => (
  <Col gap="md">
    <SkeletonBar width="46%" height={14} />
    <div className={styles.statGrid}>
      {STAT_CARD_TITLES.map((title) => (
        <Card key={title}>
          <Col gap="sm">
            <Text variant="sectionTitle">{title}</Text>
            {STAT_VALUE_WIDTHS.map((width) => (
              <Col key={width} gap="none" aria-hidden="true">
                <SkeletonBar width="38%" height={11} />
                <SkeletonBar width={width} height={20} />
              </Col>
            ))}
          </Col>
        </Card>
      ))}
    </div>
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">消費税 — 3方式の比較（{year}年）</Text>
        <SkeletonBar width="72%" height={14} />
        <Col gap="sm" aria-hidden="true">
          {TAX_BAR_WIDTHS.map((width) => (
            <Row key={width} gap="sm" align="center">
              <SkeletonBar width="120px" height={14} />
              <SkeletonBar width={width} height={14} radius={4} />
              <SkeletonBar width="76px" height={14} />
            </Row>
          ))}
        </Col>
      </Col>
    </Card>
  </Col>
);

const BreakdownSkeleton = ({ year }: { year: number }) => (
  <Card>
    <Col gap="md">
      <Text variant="sectionTitle">収入・支出の内訳 — {year}年</Text>
      <div className={styles.breakdownGrid}>
        {BREAKDOWN_TITLES.map((title) => (
          <Col key={title} gap="sm">
            <Text variant="statLabel">{title}</Text>
            <div className={styles.donut} aria-hidden="true" />
            <Col gap="sm" aria-hidden="true">
              {LEGEND_ROWS.map((row) => (
                <Row key={row} gap="sm" align="center">
                  <SkeletonBar width="12px" height={12} radius={3} />
                  <SkeletonBar width="34%" height={13} />
                  <SkeletonBar width="64px" height={13} />
                  <SkeletonBar width="30px" height={13} />
                </Row>
              ))}
            </Col>
          </Col>
        ))}
      </div>
    </Col>
  </Card>
);

const TrialBalanceSkeleton = ({ year }: { year: number }) => (
  <Card>
    <Col gap="sm">
      <Text variant="sectionTitle">損益計算書（実績）— {year}年</Text>
      <SkeletonBar width="58%" height={14} />
      <Col gap="sm" aria-hidden="true">
        {TRIAL_ROWS.map((row) => (
          <Row key={row} gap="md">
            <SkeletonBar width="22%" />
            <SkeletonBar width="12%" />
            <SkeletonBar width="18%" />
            <SkeletonBar width="18%" />
            <SkeletonBar width="18%" />
          </Row>
        ))}
      </Col>
    </Col>
  </Card>
);
