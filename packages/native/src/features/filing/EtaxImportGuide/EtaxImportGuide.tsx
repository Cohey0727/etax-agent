import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { colors, radius, space } from "@/theme";

export interface EtaxImportGuideProps {
  /** 保存したXTXファイル名。ファイル選択のステップで案内する。 */
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
 * 実際の画面遷移の順にステップで案内する。
 */
export function EtaxImportGuide({ filename }: EtaxImportGuideProps) {
  const steps: readonly { title: string; body: string }[] = [
    ...STEPS_WITHOUT_FILE,
    {
      title: "保存したXTXファイルを選択する",
      body: filename
        ? `「${filename}」を選択して取り込みます。`
        : "保存したXTXファイルを選択して取り込みます。",
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
    <View style={styles.wrap}>
      <AppText size="sm" weight="semibold" tone="muted">
        e-Taxソフト（WEB版）での取り込み手順
      </AppText>
      {steps.map((step, index) => (
        <View key={step.title} style={styles.step}>
          <View style={styles.stepNumber}>
            <AppText size="sm" weight="bold" style={{ color: colors.onAccent }}>
              {index + 1}
            </AppText>
          </View>
          <View style={styles.stepBody}>
            <AppText size="md" weight="medium">
              {step.title}
            </AppText>
            <AppText size="sm" tone="muted">
              {step.body}
            </AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  step: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepBody: { flex: 1, gap: 2 },
});
