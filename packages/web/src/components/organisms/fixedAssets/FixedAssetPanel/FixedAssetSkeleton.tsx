import { Card, Col, Row } from "@components/atoms";
import styles from "./FixedAssetPanel.css";

/** 読み込み中に出す、実際のレイアウトと同じ形のスケルトン。 */
export const FixedAssetSkeleton = () => {
  return (
    <Col gap="lg" aria-busy="true" aria-label="固定資産を読み込んでいます">
      <Row gap="md" align="center" justify="spaceBetween">
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      </Row>
      <div className={styles.statGrid}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <Col gap="sm">
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
            </Col>
          </Card>
        ))}
      </div>
      <div className={styles.assetGrid}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
        ))}
      </div>
    </Col>
  );
};
