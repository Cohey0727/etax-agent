import { StyleSheet, View } from "react-native";
import { AppText, LabeledValue } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatYen } from "@/utils";

export interface ResultRowProps {
  label: string;
  /** 金額（円）。 */
  value: number;
  strong?: boolean;
}

/** 計算結果の表示行（ラベル＋金額）。 */
export function ResultRow({ label, value, strong }: ResultRowProps) {
  return <LabeledValue label={label} value={formatYen(value)} strong={strong} />;
}

export interface SectionHeadProps {
  title: string;
  description?: string;
}

/** パネル内の見出し（小見出し＋任意の説明）。 */
export function SectionHead({ title, description }: SectionHeadProps) {
  return (
    <View style={styles.head}>
      <AppText size="lg" weight="bold">
        {title}
      </AppText>
      {description ? (
        <AppText size="sm" tone="muted">
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

export interface StatBlockProps {
  label: string;
  /** 金額（円）。 */
  value: number;
}

/** 見出し数字のブロック（収入合計・所得合計など）。 */
export function StatBlock({ label, value }: StatBlockProps) {
  return (
    <View style={styles.stat}>
      <AppText size="xs" tone="muted">
        {label}
      </AppText>
      <AppText size="lg" weight="bold">
        {formatYen(value)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2, marginTop: space.sm },
  stat: {
    backgroundColor: colors.hover,
    borderRadius: radius.md,
    flexBasis: "47%",
    flexGrow: 1,
    gap: 2,
    padding: space.sm + 2,
  },
});
