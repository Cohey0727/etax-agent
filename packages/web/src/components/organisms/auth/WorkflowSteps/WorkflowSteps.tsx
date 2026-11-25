import { Col, Icon, IconName, Row, Text } from "@components/atoms";
import styles from "./WorkflowSteps.css";

interface WorkflowStep {
  icon: IconName;
  label: string;
  caption: string;
}

// AI が回す整備ワークフローの流れ（北極星）。実装済みの処理範囲だけを書く。
const STEPS: readonly WorkflowStep[] = [
  { icon: "receipt", label: "取り込み", caption: "領収書・明細を読み取り" },
  { icon: "book", label: "帳簿", caption: "仕訳を自動で記録" },
  { icon: "check", label: "チェック", caption: "漏れや不整合を検出" },
  { icon: "chart", label: "レポート", caption: "試算表・資金繰りを集計" },
  { icon: "fileCheck", label: "申告書", caption: "決算書と XTX を生成" },
  { icon: "send", label: "提出記録", caption: "提出の控えを保管" },
];

const DOT_DELAYS = [styles.dotDelay0, styles.dotDelay1, styles.dotDelay2] as const;

const STEP_DELAYS = [
  styles.stepDelay0,
  styles.stepDelay1,
  styles.stepDelay2,
  styles.stepDelay3,
  styles.stepDelay4,
  styles.stepDelay5,
] as const;

/**
 * WorkflowSteps — AI が処理する流れをタイムラインで見せる装飾（organisms/auth）。
 * ステップが順に弾んで現れ、処理中ドットが流れ続けることで「AI が回している」様子を伝える。
 */
export const WorkflowSteps = () => {
  return (
    <div className={styles.card}>
      <Col gap="md">
        <Row gap="sm" align="center">
          <span className={styles.cardIcon}>
            <Icon name="sparkles" size={15} />
          </span>
          <Text variant="caption" className={styles.cardTitle}>
            AI ワークフロー
          </Text>
          <span className={styles.dots} aria-hidden="true">
            {DOT_DELAYS.map((delayClass) => (
              <span key={delayClass} className={`${styles.dot} ${delayClass}`} />
            ))}
          </span>
        </Row>
        <Col gap="sm" className={styles.steps}>
          <div className={styles.line} aria-hidden="true" />
          {STEPS.map((step, index) => (
            <Row
              key={step.label}
              gap="md"
              align="center"
              className={`${styles.step} ${STEP_DELAYS[index]}`}
            >
              <span className={styles.node}>
                <Icon name={step.icon} size={15} />
              </span>
              <Text className={styles.stepLabel}>{step.label}</Text>
              <Text variant="caption" className={styles.stepCaption}>
                {step.caption}
              </Text>
            </Row>
          ))}
        </Col>
      </Col>
    </div>
  );
};
