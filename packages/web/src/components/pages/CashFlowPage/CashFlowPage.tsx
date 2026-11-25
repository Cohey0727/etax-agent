import { CashFlowPanel } from "@components/organisms/reports";

/**
 * 資金繰りレポート。対象期間はサーバー側の既定窓（当月を含む前5か月〜
 * 先6か月）で、年度切替には従わない（請求書と同じ年非依存の画面）。
 */
export const CashFlowPage = () => {
  return <CashFlowPanel />;
};
