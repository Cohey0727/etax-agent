import { AppView, FilingTab } from "@types";

/**
 * 画面とURLパスの対応。先頭は固定の名前（accounts = 帳簿ドメイン）で、
 * 年度 → 画面の順にぶら下がる。
 * 例: ダッシュボード = /accounts/2024/dashboard。
 * 帳簿は全年度をひとつの画面で管理するため年度から独立して /ledger、
 * 設定も年度から独立して /settings。
 * 納税者情報も年度から独立した独立画面 /taxpayer（年度はサイドバーの
 * 年度切替で切り替え、過去年度分が履歴として見られる）。
 * 確定申告画面はさらにタブがぶら下がる（総合はスラッグなし）。
 * 例: 収支タブ = /accounts/2024/final-tax/balance。
 */
const VIEW_SLUGS: Record<AppView, string> = {
  [AppView.Dashboard]: "dashboard",
  [AppView.Ledger]: "ledger",
  [AppView.Filing]: "final-tax",
  [AppView.Import]: "import",
  [AppView.Receipt]: "receipt",
  [AppView.Taxpayer]: "taxpayer",
  [AppView.Settings]: "settings",
  [AppView.Agent]: "agent",
};

/** 確定申告タブとURLスラッグの対応。総合（overview）は標準でスラッグなし。 */
const FILING_TAB_SLUGS: Record<FilingTab, string | null> = {
  overview: null,
  balance: "balance",
  deductions: "deductions",
  consumption: "consumption",
};

const viewForSlug = (slug: string): AppView | null => {
  const entry = (Object.entries(VIEW_SLUGS) as [AppView, string][]).find(
    ([, value]) => value === slug,
  );
  return entry ? entry[0] : null;
};

const filingTabForSlug = (slug: string): FilingTab | null => {
  const entry = (Object.entries(FILING_TAB_SLUGS) as [FilingTab, string | null][]).find(
    ([, value]) => value === slug,
  );
  return entry ? entry[0] : null;
};

const asYear = (part: string): number | null => {
  const year = Number(part);
  return Number.isInteger(year) && year > 0 ? year : null;
};

/** 画面と年度（と確定申告タブ）からURLパスを作る。 */
export const pathForView = (view: AppView, year: number, filingTab?: FilingTab): string => {
  if (view === AppView.Settings) return "/settings";
  if (view === AppView.Ledger) return "/ledger";
  if (view === AppView.Taxpayer) return "/taxpayer";
  const base = `/accounts/${year}/${VIEW_SLUGS[view]}`;
  if (view === AppView.Filing && filingTab) {
    const slug = FILING_TAB_SLUGS[filingTab];
    return slug ? `${base}/${slug}` : base;
  }
  return base;
};

export interface ParsedRoute {
  view: AppView;
  year: number | null;
  /** 確定申告画面のタブ。確定申告以外では null。 */
  filingTab: FilingTab | null;
}

/** URLパスから画面と年度を読む。未知のパスは null。/accounts/<年度> だけならその年のダッシュボード。 */
export const parsePath = (pathname: string): ParsedRoute | null => {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  if (parts[0] === VIEW_SLUGS[AppView.Settings]) {
    return { view: AppView.Settings, year: null, filingTab: null };
  }
  if (parts[0] === VIEW_SLUGS[AppView.Ledger] && parts.length === 1) {
    return { view: AppView.Ledger, year: null, filingTab: null };
  }
  if (parts[0] === VIEW_SLUGS[AppView.Taxpayer] && parts.length === 1) {
    return { view: AppView.Taxpayer, year: null, filingTab: null };
  }
  if (parts[0] !== "accounts" || parts.length < 2) return null;
  const year = asYear(parts[1]);
  if (year === null) return null;
  if (parts.length === 2) return { view: AppView.Dashboard, year, filingTab: null };
  const view = viewForSlug(parts[2]);
  if (!view) return null;
  // 旧URL（確定申告の納税者情報タブ）は独立画面へ寄せる。
  if (view === AppView.Filing && parts[3] === "taxpayer") {
    return { view: AppView.Taxpayer, year, filingTab: null };
  }
  if (view === AppView.Filing && parts.length >= 4) {
    const filingTab = filingTabForSlug(parts[3]);
    return filingTab ? { view, year, filingTab } : null;
  }
  return { view, year, filingTab: null };
};
