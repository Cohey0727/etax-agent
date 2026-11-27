import { DeductionState, TAX_PARAMETERS } from "@etax/shared";
import { useRouter } from "expo-router";
import { ComponentType, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Card, SkeletonCard, Tabs } from "@/components";
import { useAppState } from "@/state/AppContext";
import { space } from "@/theme";
import { filingInputsStore } from "../deductionState";
import { FilingSection } from "../FilingPanel";
import { LoadFailedNotice } from "../fields";
import { useYearInput } from "../useYearInput";
import {
  FilingBalanceTab,
  FilingConsumptionTab,
  FilingDeductionsTab,
  FilingOverviewTab,
  FilingTabProps,
} from "./FilingTabs";
import { useFilingModel } from "./useFilingModel";

/** タブの並び。総合が起点で、収支・控除・消費税はそれぞれ独立した作業場。納税者情報は独立画面。 */
const filingTabs = [
  { id: "overview", label: "総合", Component: FilingOverviewTab },
  { id: "balance", label: "収支", Component: FilingBalanceTab },
  { id: "deductions", label: "控除", Component: FilingDeductionsTab },
  { id: "consumption", label: "消費税", Component: FilingConsumptionTab },
] as const satisfies readonly { id: string; label: string; Component: ComponentType<FilingTabProps> }[];

export type FilingTab = (typeof filingTabs)[number]["id"];

const filingTabById: Partial<Record<string, FilingTab>> = Object.fromEntries(
  filingTabs.map((tab) => [tab.id, tab.id]),
);

/** URL の tab パラメータを確定申告画面のタブにする（知らない値は総合）。 */
export function filingTabFromParam(param: string | string[] | undefined): FilingTab {
  return (typeof param === "string" ? filingTabById[param] : undefined) ?? "overview";
}

/**
 * 確定申告の作業領域。申告入力（年度別）は納税者情報画面・エージェントと
 * 同じストアの値を読み書きする。サーバーの値を読み込むまでは入力欄を出さず、
 * 取得できなかったときは再読み込みだけを出す（空の入力から保存すると、
 * サーバーの値を全体置換で消してしまうため）。
 */
export function FilingWorkspace({ initialTab = "overview" }: { initialTab?: FilingTab }) {
  const { year } = useAppState();
  const { entry, update, reload } = useYearInput(filingInputsStore, year);
  // 所得税の計算は年分ごとの税務パラメータが無いと行えない（無い年分で計算すると例外になる）
  if (!(year in TAX_PARAMETERS)) {
    return (
      <Card>
        <AppText size="sm" tone="muted">
          {year}年分は所得税の計算に未対応です（対応: {Object.keys(TAX_PARAMETERS).join("・")}
          年分）。年度を切り替えてください。
        </AppText>
      </Card>
    );
  }
  if (entry.status === "loading") {
    return (
      <View style={styles.wrap}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (entry.status === "failed") {
    return (
      <Card>
        <LoadFailedNotice message="申告入力を取得できませんでした。" onRetry={reload} />
      </Card>
    );
  }
  return (
    <FilingWorkspaceContent initialTab={initialTab} deductionState={entry.value} update={update} />
  );
}

interface FilingWorkspaceContentProps {
  initialTab: FilingTab;
  deductionState: DeductionState;
  update: (change: (current: DeductionState) => DeductionState) => void;
}

/**
 * 申告入力が読めたあとの作業領域。タブを切り替えても数字は同じ model から出す。
 * 「控除・計算」を確定すると計算結果がスナップショットとして控えられ、
 * 差し戻して再確定するときに前回確定との比較に使う。
 */
function FilingWorkspaceContent({ initialTab, deductionState, update }: FilingWorkspaceContentProps) {
  const router = useRouter();
  const model = useFilingModel(deductionState);
  const [tab, setTab] = useState<FilingTab>(initialTab);

  // 総合タブのセクションリンク。納税者情報だけはタブではなく独立画面へ遷移する。
  const openSection = (section: FilingSection) => {
    if (section === "taxpayer") {
      router.navigate("/taxpayer");
    } else {
      setTab(section);
    }
  };

  const { Component } = filingTabs.find((item) => item.id === tab) ?? filingTabs[0];
  return (
    <View style={styles.wrap}>
      <AppText size="sm" tone="muted">
        {model.year}年分の確定申告です。タブはそれぞれ独立した作業場で、順番は問いません。
      </AppText>
      <Tabs items={filingTabs} activeId={tab} onChange={setTab} />
      <Component model={model} update={update} onOpenSection={openSection} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
});
