import { ComponentType } from "react";
import { IconName } from "@components/atoms";
import { AppView, FilingTab, ViewPageProps } from "@types";
import { CashFlowPage } from "../CashFlowPage";
import { DashboardPage } from "../DashboardPage";
import { FilingPage } from "../FilingPage";
import { FixedAssetsPage } from "../FixedAssetsPage";
import { InvoicesPage } from "../InvoicesPage";
import { ImportPage } from "../ImportPage";
import { LedgerPage } from "../LedgerPage";
import { McpSettingsPage } from "../McpSettingsPage";
import { ReceiptPage } from "../ReceiptPage";
import { ReportsPage } from "../ReportsPage";
import { SettingsPage } from "../SettingsPage";
import { TaxpayerPage } from "../TaxpayerPage";

// nav: サイドバーに出す画面。取込・領収書は帳簿の「追加」からの遷移専用
// （サイドバーには出さない）。設定も通常のメニュー項目として並べる。
// 修正は独立した画面を持たず、確定 → 差し戻し → 再確定の流れの中で
// 前回確定との差分として確定申告画面に出す。
export const appViews = [
  { id: AppView.Dashboard, label: "ダッシュボード", icon: "grid", nav: true, Component: DashboardPage },
  { id: AppView.Import, label: "取引・CSV取込", icon: "import", nav: false, Component: ImportPage },
  { id: AppView.Receipt, label: "領収書から帳簿", icon: "receipt", nav: false, Component: ReceiptPage },
  { id: AppView.Ledger, label: "帳簿", icon: "book", nav: true, Component: LedgerPage },
  { id: AppView.Reports, label: "試算表", icon: "bill", nav: true, Component: ReportsPage },
  { id: AppView.CashFlow, label: "資金繰り", icon: "chart", nav: true, Component: CashFlowPage },
  { id: AppView.FixedAssets, label: "固定資産", icon: "building", nav: true, Component: FixedAssetsPage },
  { id: AppView.Invoices, label: "請求書", icon: "receipt", nav: true, Component: InvoicesPage },
  { id: AppView.Taxpayer, label: "納税者情報", icon: "user", nav: true, Component: TaxpayerPage },
  { id: AppView.Filing, label: "確定申告", icon: "fileCheck", nav: true, Component: FilingPage },
  { id: AppView.McpSettings, label: "MCP設定", icon: "settings", nav: true, Component: McpSettingsPage },
  { id: AppView.Settings, label: "設定", icon: "settings", nav: true, Component: SettingsPage },
] as const satisfies readonly {
  id: AppView;
  label: string;
  icon: IconName;
  nav: boolean;
  Component: ComponentType<ViewPageProps>;
}[];

// サイドバーで確定申告にぶら下げる子項目（タブへの直接遷移）。総合は親そのものなので出さない。
// 納税者情報は独立した画面なので、ここには含めない。
export const FILING_NAV_CHILDREN: readonly { view: AppView; key: FilingTab; label: string }[] = [
  { view: AppView.Filing, key: "balance", label: "収支" },
  { view: AppView.Filing, key: "deductions", label: "控除" },
  { view: AppView.Filing, key: "consumption", label: "消費税" },
];
