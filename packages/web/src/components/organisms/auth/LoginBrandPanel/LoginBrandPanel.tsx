import { Col, Icon, Logo, Row, Text } from "@components/atoms";
import { WorkflowSteps } from "@components/organisms/auth/WorkflowSteps";
import styles from "./LoginBrandPanel.css";

// 価値訴求。実装済みの事実の範囲で書く（実績数値などの誇大表示はしない）。
const VALUE_PROPS: readonly string[] = [
  "領収書の取り込みから申告書の作成まで、AI が自動で進めます",
  "MCP 連携で、Claude Code など外部の AI エージェントからそのまま操作できます",
  "計算は決定的エンジン。何度でも同じ結果を再現できます",
];

const RISE_DELAYS = [
  styles.riseDelay0,
  styles.riseDelay1,
  styles.riseDelay2,
  styles.riseDelay3,
  styles.riseDelay4,
] as const;

/**
 * LoginBrandPanel — ログイン画面の左側ブランドパネル（organisms/auth）。
 * 主役のコピーは「AIが、すべてやります」。自動化の流れ（WorkflowSteps）と
 * 税理士法の線引き注記で、世界観と境界を第一印象で伝える。
 */
export const LoginBrandPanel = () => {
  return (
    <section className={styles.root}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.glowTop} aria-hidden="true" />
      <div className={styles.glowBottom} aria-hidden="true" />
      <Col gap="lg" justify="center" className={styles.content}>
        <Row gap="sm" align="center" className={`${styles.rise} ${RISE_DELAYS[0]}`}>
          <div className={styles.brandMark}>
            <Logo variant="icon" size={40} />
          </div>
          <Col gap="none">
            <Text variant="sectionTitle" className={styles.brandTitle}>
              eTaxAgent
            </Text>
            <Text variant="caption" className={styles.brandCaption}>
              確定申告 準備ツール
            </Text>
          </Col>
        </Row>

        <Col gap="md" className={`${styles.rise} ${RISE_DELAYS[1]}`}>
          <Text variant="hero" className={styles.headline}>
            AIが、<span className={styles.headlineAccent}>すべて</span>やります。
          </Text>
          <Text className={styles.lead}>
            取り込みから帳簿、チェック、申告書の作成まで。税務の整備は AI
            が一気通貫で回します。あなたは確認と最終判断だけ。
          </Text>
        </Col>

        <Col gap="sm" className={`${styles.values} ${styles.rise} ${RISE_DELAYS[2]}`}>
          {VALUE_PROPS.map((valueProp) => (
            <Row key={valueProp} gap="sm" align="start">
              <span className={styles.valueIcon}>
                <Icon name="check" size={13} />
              </span>
              <Text className={styles.valueText}>{valueProp}</Text>
            </Row>
          ))}
        </Col>

        <div className={`${styles.workflow} ${styles.rise} ${RISE_DELAYS[3]}`}>
          <WorkflowSteps />
        </div>

        <Text variant="caption" className={`${styles.note} ${styles.rise} ${RISE_DELAYS[4]}`}>
          申告内容の最終確認と e-Tax への提出は、ご本人による操作です。
        </Text>
      </Col>
    </section>
  );
};
