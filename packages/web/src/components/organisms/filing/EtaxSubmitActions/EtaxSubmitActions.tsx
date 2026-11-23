import QRCode from "react-qr-code";
import { Col, Row, Text } from "@components/atoms";
import styles from "./EtaxSubmitActions.css";

/** 提出先の e-Tax トップページ。スマホでも同じ入口から申請を続けられる。 */
const ETAX_URL = "https://www.e-tax.nta.go.jp";

/**
 * 提出のアクション（e-Tax への遷移と、スマホで続けるための QR コード）。
 * 提出そのものはこのアプリでは行えない（マイナンバーカードで本人が
 * e-Tax で送信する）ため、「済みにできる項目」ではなく実際の提出先への
 * 動線として置く。
 */
export const EtaxSubmitActions = () => {
  return (
    <Col gap="sm">
      <Row gap="sm">
        <a className={styles.submitLink} href={ETAX_URL} target="_blank" rel="noreferrer">
          提出する（e-Taxを開く）
        </a>
      </Row>
      <Row gap="md" align="center">
        <div className={styles.qrBox}>
          <QRCode value={ETAX_URL} size={112} />
        </div>
        <Text variant="muted">
          スマホで申請を続ける場合は、このQRコードを読み取ってください。
          e-Tax（スマートフォン版）が開きます。
        </Text>
      </Row>
    </Col>
  );
};
