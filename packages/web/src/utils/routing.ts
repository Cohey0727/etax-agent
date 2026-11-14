import { AppView } from "@types";

/**
 * 画面とURLパスの対応。年度を持つ画面は /<slug>/<年度>、持たない画面は /<slug>。
 * 例: 帳簿 = /accounts/2024、確定申告 = /tax/2024、設定 = /settings。
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

const YEAR_VIEWS: ReadonlySet<AppView> = new Set([
  AppView.Dashboard,
  AppView.Ledger,
  AppView.Filing,
  AppView.Amend,
]);

/** 画面と年度からURLパスを作る。 */
export const pathForView = (view: AppView, year: number): string =>
  YEAR_VIEWS.has(view) ? `/${VIEW_SLUGS[view]}/${year}` : `/${VIEW_SLUGS[view]}`;

/** URLパスから画面と年度を読む。未知のパスは null。 */
export const parsePath = (
  pathname: string,
): { view: AppView; year: number | null } | null => {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const entry = (Object.entries(VIEW_SLUGS) as [AppView, string][]).find(
    ([, slug]) => slug === parts[0],
  );
  if (!entry) return null;
  const [view] = entry;
  const parsedYear = parts[1] ? Number(parts[1]) : Number.NaN;
  return {
    view,
    year: Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : null,
  };
};
