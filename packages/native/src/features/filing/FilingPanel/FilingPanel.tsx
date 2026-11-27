import { FilingFigures, FilingType } from "@etax/shared";
import { ComponentType } from "react";
import { StyleSheet, View } from "react-native";
import { AppButton, AppText, Card } from "@/components";
import { FilingSnapshot, FilingSnapshotFigures } from "@/api";
import { space } from "@/theme";
import { ConfirmComparePanel } from "../ConfirmComparePanel";
import { FilingStatusToggle } from "../FilingStatusToggle";
import { IncomeSummary } from "../IncomeSummary";
import { TaxSummary } from "../TaxSummary";
import { FilingStatusKey } from "../useFilingStatus";

/**
 * 総合から遷移できる先。収支・控除・消費税は確定申告画面のタブ、
 * 納税者情報は独立画面（タブではないが、総合の項目としては並べる）。
 */
export type FilingSection = "balance" | "deductions" | "consumption" | "taxpayer";

const sectionOpenLabels: Record<FilingSection, string> = {
  balance: "収支タブを開く",
  deductions: "控除タブを開く",
  consumption: "消費税タブを開く",
  taxpayer: "納税者情報を開く",
};

/** 各項目の下に出す、その項目の結果の数字。 */
interface ManualItemSummaryProps {
  year: number;
  /** 帳簿と申告入力から求めた所得と所得税額 */
  figures: FilingFigures;
  filingType: FilingType;
  hasTransactions: boolean;
  snapshots: FilingSnapshot[] | null;
  currentFigures: FilingSnapshotFigures | null;
}

function BalanceItemSummary({ figures, filingType, hasTransactions }: ManualItemSummaryProps) {
  return <IncomeSummary figures={figures} filingType={filingType} hasTransactions={hasTransactions} />;
}

function CalculationItemSummary({
  year,
  figures,
  snapshots,
  currentFigures,
}: ManualItemSummaryProps) {
  return (
    <>
      <TaxSummary taxResult={figures.taxResult} />
      <ConfirmComparePanel bare year={year} snapshots={snapshots} currentFigures={currentFigures} />
    </>
  );
}

/**
 * 手動で「確定」を付けられる項目。どれも独立していて、順番は問わない。
 * 各項目の行の直下に、その項目の結果の数字（収支→所得、控除・計算→税額）を
 * 並べ、見直してそのまま「確定」にできるようにする。
 * 提出はこのアプリでは行えない（e-Tax で本人が送信する）ため、確定を付ける
 * 項目には含めない。提出の動線（XTX出力と e-Tax へのリンク）は下の
 * 提出パネル（TaxpayerPanel）のカードにだけ置く（重複させない）。
 */
const manualItems = [
  {
    key: "confirmed",
    label: "収支",
    description:
      "収支の金額・科目・区分に誤りがないか見直したら確定します。見直しは収支タブで行います。",
    section: "balance",
    confirmsCalculation: false,
    Summary: BalanceItemSummary,
  },
  {
    key: "calculated",
    label: "控除・計算",
    description:
      "所得控除・税額控除を入力すると所得税額が自動計算されます。入力は控除タブで行います。確定するとその時点の計算結果が控えられ、確定解除して直してから再確定すると、前回確定との差分が下に出ます。",
    section: "deductions",
    confirmsCalculation: true,
    Summary: CalculationItemSummary,
  },
] as const satisfies readonly {
  key: FilingStatusKey;
  label: string;
  description: string;
  /** その項目の作業をするタブ。 */
  section: FilingSection;
  /** 確定したときに計算結果の控え（確定スナップショット）を作るか。 */
  confirmsCalculation: boolean;
  Summary: ComponentType<ManualItemSummaryProps>;
}[];

export interface FilingPanelProps extends ManualItemSummaryProps {
  /** 「控除・計算」を確定した直後に計算結果を控える。控えられたか。 */
  onConfirmCalculation: () => Promise<boolean>;
  /** 総合タブから各タブへ遷移する（確定申告画面内のタブ切替）。 */
  onOpenSection: (section: FilingSection) => void;
}

/**
 * 確定申告の総合カード。各入力・手続きは独立していて、どの順番でも
 * 行ったり来たりできる（ステッパーは置かない）。
 * ステータスはダッシュボードの表示とサーバー保存を共有する。
 */
export function FilingPanel({ onConfirmCalculation, onOpenSection, ...summaryProps }: FilingPanelProps) {
  return (
    <Card>
      <View style={styles.wrap}>
        <View style={styles.head}>
          <AppText size="xl" weight="bold">
            {summaryProps.year}年分の確定申告
          </AppText>
          <AppText size="sm" tone="muted">
            収支と控除・計算はそれぞれ独立した項目です。どの順番でも入力でき、
            いつでも行き来して直せます。確定した項目には印を付けておけます（ダッシュボードの
            申告ステータスと共有）。提出は e-Tax で行います。
          </AppText>
        </View>

        {manualItems.map(({ key, label, description, section, confirmsCalculation, Summary }) => (
          <View key={key} style={styles.item}>
            <FilingStatusToggle
              bare
              year={summaryProps.year}
              statusKey={key}
              label={label}
              description={description}
              onConfirm={confirmsCalculation ? onConfirmCalculation : undefined}
            />
            <View style={styles.actions}>
              <AppButton
                label={sectionOpenLabels[section]}
                variant="ghost"
                size="sm"
                onPress={() => onOpenSection(section)}
              />
            </View>
            <Summary {...summaryProps} />
          </View>
        ))}

        <View style={styles.item}>
          <AppText size="lg" weight="bold">
            消費税
          </AppText>
          <AppText size="sm" tone="muted">
            消費税の申告書（方式の比較とXTX出力）は、所得税とは別の提出物として
            消費税タブで用意します。
          </AppText>
          <View style={styles.actions}>
            <AppButton
              label={sectionOpenLabels.consumption}
              variant="ghost"
              size="sm"
              onPress={() => onOpenSection("consumption")}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { gap: space.sm },
  item: { gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
