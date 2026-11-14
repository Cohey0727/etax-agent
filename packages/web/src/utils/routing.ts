import { AppView } from "@types";

/**
 * 画面とURLパスの対応。年度が根元で、画面はその下にぶら下がる。
 * 例: ダッシュボード = /2024/dashboard、帳簿 = /2024/accounts、確定申告 = /2024/tax。
 * 設定だけは年度から独立して /settings。
 */
const VIEW_SLUGS: Record<AppView, string> = {
  [AppView.Dashboard]: "dashboard",
  [AppView.Ledger]: "accounts",
  [AppView.Filing]: "tax",
  [AppView.Amend]: "amend",
  [AppView.Import]: "import",
  [AppView.Receipt]: "receipt",
  [AppView.Settings]: "settings",
  [AppView.Agent]: "agent",
};

/** 画面と年度からURLパスを作る。 */
export const pathForView = (view: AppView, year: number): string =>
  view === AppView.Settings ? "/settings" : `/${year}/${VIEW_SLUGS[view]}`;

/** URLパスから画面と年度を読む。未知のパスは null。/<年度> だけならその年のダッシュボード。 */
export const parsePath = (
  pathname: string,
): { view: AppView; year: number | null } | null => {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  if (parts[0] === VIEW_SLUGS[AppView.Settings]) {
    return { view: AppView.Settings, year: null };
  }
  const year = Number(parts[0]);
  if (!Number.isInteger(year) || year <= 0) return null;
  if (parts.length === 1) return { view: AppView.Dashboard, year };
  const entry = (Object.entries(VIEW_SLUGS) as [AppView, string][]).find(
    ([, slug]) => slug === parts[1],
  );
  if (!entry) return null;
  return { view: entry[0], year };
};
