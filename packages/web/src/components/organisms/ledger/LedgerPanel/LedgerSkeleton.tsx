import { Card, Col, Row } from "@components/atoms";
import styles from "./LedgerPanel.css";

/** 読み込み中に出す、実際のレイアウトと同じ形のスケルトン。 */
export const LedgerSkeleton = () => {
  return (
    <Col gap="lg" aria-busy="true" aria-label="帳簿を読み込んでいます">
      <Col gap="md">
        <Row gap="md" align="center" justify="spaceBetween">
          <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
          <div className={`${styles.skeleton} ${styles.skeletonButton}`} />
        </Row>
        <div className={styles.statGrid}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Col gap="sm">
                <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
                <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
              </Col>
            </Card>
          ))}
        </div>
        <div className={`${styles.skeleton} ${styles.skeletonSearch}`} />
        <Card>
          <Col gap="sm">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className={`${styles.skeleton} ${styles.skeletonRow}`} />
            ))}
          </Col>
        </Card>
      </Col>
    </Col>
  );
};
