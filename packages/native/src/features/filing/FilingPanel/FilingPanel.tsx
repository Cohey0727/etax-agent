import {
  BlueDeductionOptions,
  IncomeTaxResult,
  MiscIncomeInput,
  SalaryIncomeInput,
  Transaction,
} from "@etax/shared";
import { Fragment, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppButton, AppText, Card, Chip } from "@/components";
import { createFilingSnapshot } from "@/api";
import { space } from "@/theme";
import { formatDate } from "@/utils";
import { ConfirmComparePanel, buildSnapshotFigures } from "../ConfirmComparePanel";
import { IncomeSummary } from "../IncomeSummary";
import { TaxSummary } from "../TaxSummary";
import { FilingStatusKey, useFilingStatus } from "../useFilingStatus";
import { useFilingSnapshots } from "../useFilingSnapshots";

/**
 * 総合から遷移できる先。収支・控除・消費税は確定申告画面のタブ、
 * 納税者情報は独立画面（タブではないが、総合の項目としては並べる）。
 */
export type FilingSection = "balance" | "deductions" | "consumption" | "taxpayer";

const SECTION_OPEN_LABELS: Record<FilingSection, string> = {
  balance: "収支タブを開く",
  deductions: "控除タブを開く",
  consumption: "消費税タブを開く",
  taxpayer: "納税者情報を開く",
};

interface ManualItem {
  key: FilingStatusKey;
  label: string;
  description: string;
  /** その項目の作業をするタブ。 */
  section: FilingSection;
}

/**
 * 手動で「確定」を付けられる項目。どれも独立していて、順番は問わない。
 * 各項目の行の直下に、その項目の結果の数字（収支→所得、控除・計算→税額）を
 * 並べ、見直してそのまま「確定」にできるようにする。
 * 提出はこのアプリでは行えない（e-Tax で本人が送信する）ため、確定を付ける
 * 項目には含めない。提出の動線（XTX出力と e-Tax へのリンク）は下の
 * 提出パネル（TaxpayerPanel）のカードにだけ置く（重複させない）。
 */
const MANUAL_ITEMS: readonly ManualItem[] = [
  {
    key: "confirmed",
    label: "収支",
    description:
      "収支の金額・科目・区分に誤りがないか見直したら確定します。見直しは収支タブで行います。",
    section: "balance",
  },
  {
    key: "calculated",
    label: "控除・計算",
    description:
      "所得控除・税額控除を入力すると所得税額が自動計算されます。入力は控除タブで行います。確定するとその時点の計算結果が控えられ、確定解除して直してから再確定すると、前回確定との差分が下に出ます。",
    section: "deductions",
  },
];

export interface FilingPanelProps {
  transactions: Transaction[];
  /** 選択中の年度 */
  year: number;
  /** 所得税の計算結果。「控除・計算」の行の下に税額の要約を表示するために使う。 */
  taxResult?: IncomeTaxResult;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
  /** 雑所得。所得の要約で合計に含める。 */
  miscIncome?: MiscIncomeInput;
  /** 給与所得。所得の要約で合計に含める。 */
  salaryIncome?: SalaryIncomeInput;
  /** 総合タブから各タブへ遷移する（確定申告画面内のタブ切替）。 */
  onOpenSection?: (section: FilingSection) => void;
}

/**
 * 確定申告の総合カード。各入力・手続きは独立していて、どの順番でも
 * 行ったり来たりできる（ステッパーは置かない）。
 * ステータスはダッシュボードの表示とサーバー保存を共有する。
 */
export function FilingPanel({
  transactions,
  year,
  taxResult,
  filingOptions,
  miscIncome,
  salaryIncome,
  onOpenSection,
}: FilingPanelProps) {
  const { status, loaded, available, savingKey, toggle } = useFilingStatus(year);
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const currentFigures = useMemo(
    () =>
      buildSnapshotFigures(transactions, year, filingOptions, miscIncome, taxResult, salaryIncome),
    [transactions, year, filingOptions, miscIncome, taxResult, salaryIncome],
  );

  // 「控除・計算」を確定するときは、その時点の計算結果をスナップショットとして
  // サーバーに控える（差し戻して再確定したときに前回確定と比べるため）。
  const handleToggle = async (item: ManualItem) => {
    const turningOn = !status[item.key];
    await toggle(item.key);
    if (item.key === "calculated" && turningOn && currentFigures) {
      await createFilingSnapshot(year, currentFigures);
      await refreshSnapshots();
    }
  };

  return (
    <Card>
      <View style={styles.wrap}>
        <View style={styles.head}>
          <AppText size="xl" weight="bold">
            {year}年分の確定申告
          </AppText>
          <AppText size="sm" tone="muted">
            収支と控除・計算はそれぞれ独立した項目です。どの順番でも入力でき、
            いつでも行き来して直せます。確定した項目には印を付けておけます（ダッシュボードの
            申告ステータスと共有）。提出は e-Tax で行います。
          </AppText>
        </View>

        {MANUAL_ITEMS.map((item) => {
          const done = status[item.key];
          const doneAt = status[`${item.key}_at`];
          return (
            <Fragment key={item.key}>
              <View style={styles.item}>
                <View style={styles.itemHead}>
                  <AppText size="lg" weight="bold">
                    {item.label}
                  </AppText>
                  <Chip
                    label={done ? `確定${doneAt ? `（${formatDate(doneAt)}）` : ""}` : "未確定"}
                    tone={done ? "accent" : "muted"}
                  />
                </View>
                <AppText size="sm" tone="muted">
                  {item.description}
                </AppText>
                <View style={styles.actions}>
                  <AppButton
                    label={SECTION_OPEN_LABELS[item.section]}
                    variant="ghost"
                    size="sm"
                    disabled={!onOpenSection}
                    onPress={() => onOpenSection?.(item.section)}
                  />
                  <AppButton
                    label={done ? "確定解除" : "確定する"}
                    variant={done ? "ghost" : "primary"}
                    size="sm"
                    disabled={savingKey === item.key || !available}
                    loading={savingKey === item.key}
                    onPress={() => void handleToggle(item)}
                  />
                </View>
              </View>
              {item.key === "confirmed" ? (
                <IncomeSummary
                  transactions={transactions}
                  year={year}
                  filingOptions={filingOptions}
                  miscIncome={miscIncome}
                  salaryIncome={salaryIncome}
                />
              ) : null}
              {item.key === "calculated" && taxResult ? <TaxSummary taxResult={taxResult} /> : null}
              {item.key === "calculated" ? (
                <ConfirmComparePanel
                  bare
                  year={year}
                  snapshots={snapshots}
                  currentFigures={currentFigures}
                />
              ) : null}
            </Fragment>
          );
        })}

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
              label={SECTION_OPEN_LABELS.consumption}
              variant="ghost"
              size="sm"
              disabled={!onOpenSection}
              onPress={() => onOpenSection?.("consumption")}
            />
          </View>
        </View>

        {loaded && !available ? (
          <AppText size="sm" tone="muted">
            ステータスを保存するサーバーに接続できていません。「確定する」は接続時に使えます。
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { gap: space.sm },
  item: { gap: space.sm },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
