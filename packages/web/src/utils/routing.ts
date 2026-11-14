import { AppView } from "@types";

/**
 * 画面とURLパスの対応。先頭は固定の名前（accounts = 帳簿ドメイン）で、
 * 年度 → 画面の順にぶら下がる。
 * 例: ダッシュボード = /accounts/2024/dashboard、帳簿 = /accounts/2024/ledger。
 * 設定だけは年度から独立して /settings。
 */
const VIEW_SLUGS: Record<AppView, string> = {
  [AppView.Dashboard]: "dashboard",
  [AppView.Ledger]: "ledger",
  [AppView.Filing]: "final-tax",
  [AppView.Amend]: "amend",
  [AppView.Import]: "import",
  [AppView.Receipt]: "receipt",
  [AppView.Settings]: "settings",
  [AppView.Agent]: "agent",
};

const viewForSlug = (slug: string): AppView | null => {
  const entry = (Object.entries(VIEW_SLUGS) as [AppView, string][]).find(
    ([, value]) => value === slug,
  );
  return entry ? entry[0] : null;
};

const asYear = (part: string): number | null => {
  const year = Number(part);
  return Number.isInteger(year) && year > 0 ? year : null;
};

/** 画面と年度からURLパスを作る。 */
export const pathForView = (view: AppView, year: number): string =>
  view === AppView.Settings
    ? "/settings"
    : `/accounts/${year}/${VIEW_SLUGS[view]}`;

/** URLパスから画面と年度を読む。未知のパスは null。/accounts/<年度> だけならその年のダッシュボード。 */
export const parsePath = (
  pathname: string,
): { view: AppView; year: number | null } | null => {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  if (parts[0] === VIEW_SLUGS[AppView.Settings]) {
    return { view: AppView.Settings, year: null };
  }
  if (parts[0] !== "accounts" || parts.length < 2) return null;
  const year = asYear(parts[1]);
  if (year === null) return null;
  if (parts.length === 2) return { view: AppView.Dashboard, year };
  const view = viewForSlug(parts[2]);
  return view ? { view, year } : null;
};
