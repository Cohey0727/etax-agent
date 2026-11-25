import { Col, Row, Text } from "@components/atoms";
import styles from "./EtaxImportGuide.css";

export interface EtaxImportGuideProps {
  /** ダウンロードしたXTXファイル名。ファイル選択のステップで案内する。 */
  filename?: string;
}

const STEPS_WITHOUT_FILE: readonly { title: string; body: string }[] = [
  {
    title: "e-Taxソフト（WEB版）にログインする",
    body: "マイナンバーカード、またはスマホ用電子証明書でログインします。ID・パスワード方式は新規発行が停止されており、令和9年分から利用できなくなる予定のため使いません。",
  },
  {
    title: "「申告・申請・納税」を選ぶ",
    body: "ログイン後のメニューから「申告・申請・納税」を開きます。",
  },
  {
    title: "「作成済み申告データの再利用」を選ぶ",
    body: "新規作成ではなく、作成済みデータの再利用（組み込み）の入口を選びます。",
  },
];

/**
 * XTX生成直後に出す、e-Taxソフト（WEB版）への取り込み手順。
 * 送信そのものは本人が e-Tax で行うため、迷わず取り込めるよう
 * 実際の画面遷移の順にステップで案内する（Issue #28 Phase 1）。
 */
export const EtaxImportGuide = ({ filename }: EtaxImportGuideProps) => {
  const steps: readonly { title: string; body: string }[] = [
    ...STEPS_WITHOUT_FILE,
    {
      title: "ダウンロードしたXTXファイルを選択する",
      body: filename
        ? `「${filename}」を選択して取り込みます。`
        : "ダウンロードしたXTXファイルを選択して取り込みます。",
    },
    {
      title: "内容を確認して送信する",
      body: "取り込まれた申告内容を確認し、電子署名を付けて送信します。送信後に受信通知が届きます。",
    },
    {
      title: "受付番号を記録する",
      body: "受信通知に表示される受付番号を、この画面の「提出の記録」に入力して保存してください。受信通知PDFも添付しておけます。",
    },
  ];
  return (
    <Col gap="sm">
      <Text variant="statLabel">e-Taxソフト（WEB版）での取り込み手順</Text>
      {steps.map((step, index) => (
        <Row key={step.title} gap="sm" align="start">
          <span className={styles.stepNumber}>{index + 1}</span>
          <Col gap="none">
            <Text>{step.title}</Text>
            <Text variant="muted">{step.body}</Text>
          </Col>
        </Row>
      ))}
    </Col>
  );
};
