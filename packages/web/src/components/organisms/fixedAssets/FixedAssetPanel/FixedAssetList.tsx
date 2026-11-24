import { Badge, Card, Col, Icon, Row, Text } from "@components/atoms";
import { FixedAssetImageRecord, FixedAssetRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./FixedAssetPanel.css";
import {
  INCOME_TYPE_LABELS,
  METHOD_LABELS,
  bookValueAt,
  deductibleAt,
  depreciationProgress,
  disposedYearOf,
} from "./fixedAssetOptions";

export interface FixedAssetListProps {
  assets: FixedAssetRecord[];
  year: number;
  selectedId: number | null;
  images: Record<number, FixedAssetImageRecord[]>;
  onSelect: (assetId: number) => void;
}

/** 資産カードの一覧。サムネイル・償却の進み具合・当年の償却費を1枚に集約する。 */
export const FixedAssetList = ({ assets, year, selectedId, images, onSelect }: FixedAssetListProps) => {
  return (
    <div className={styles.assetGrid}>
      {assets.map((asset) => {
        const firstImage = images[asset.id]?.[0];
        const disposedYear = disposedYearOf(asset);
        const progress = Math.round(depreciationProgress(asset, year) * 100);
        return (
          <Card
            key={asset.id}
            className={`${styles.assetCard} ${asset.id === selectedId ? styles.assetCardSelected : ""}`}
            onClick={() => onSelect(asset.id)}
          >
            <Col gap="sm">
              <Row gap="md" align="start">
                {firstImage ? (
                  <img className={styles.thumb} src={firstImage.url} alt="" />
                ) : (
                  <div className={styles.thumbPlaceholder}>
                    <Icon name="building" size={26} />
                  </div>
                )}
                <Col gap="sm">
                  <Text variant="sectionTitle">{asset.name}</Text>
                  <Row gap="sm" wrap>
                    <Badge>{INCOME_TYPE_LABELS[asset.income_type] ?? asset.income_type}</Badge>
                    <Badge>{METHOD_LABELS[asset.method]}</Badge>
                    {disposedYear !== null ? <Badge>除却済み（{asset.disposed_date}）</Badge> : null}
                  </Row>
                </Col>
              </Row>
              <Row justify="spaceBetween">
                <Text variant="muted">取得価額</Text>
                <Text variant="body">{formatYen(asset.cost)}</Text>
              </Row>
              <Row justify="spaceBetween">
                <Text variant="muted">
                  {year}年の償却費 / 年末残高
                </Text>
                <Text variant="body">
                  {formatYen(deductibleAt(asset, year))} / {formatYen(bookValueAt(asset, year))}
                </Text>
              </Row>
              <div className={styles.miniProgressTrack}>
                <div className={styles.miniProgressFill} style={{ width: `${progress}%` }} />
              </div>
              <Row justify="spaceBetween">
                <Text variant="caption">
                  {asset.acquisition_date} 取得・耐用年数{asset.useful_life_years}年
                </Text>
                <Text variant="caption">償却 {progress}%</Text>
              </Row>
            </Col>
          </Card>
        );
      })}
    </div>
  );
};
