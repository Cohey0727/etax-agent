import { Col, Row } from "@components/atoms";
import styles from "./InvoicePanel.css";

/** 請求書画面の読み込み中スケルトン（一覧カードの形に合わせる）。 */
export const InvoiceSkeleton = () => {
  return (
    <Col gap="lg">
      <Row justify="spaceBetween" align="center">
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      </Row>
      <div className={styles.cardGrid}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
        ))}
      </div>
    </Col>
  );
};
