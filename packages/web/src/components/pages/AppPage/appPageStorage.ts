import { SendKeyMode, ThemeMode } from "@types";
import { userScopedKey } from "@utils";

/**
 * appPageStorage.ts — AppPage が端末保存（localStorage）から読む
 * 表示設定・選択年度の読み取りと、テーマの適用。
 * いずれも保存値が読めない環境では既定値に倒す（例外を外へ出さない）。
 */

export const THEME_STORAGE_KEY = "etax-theme";

export const readStoredThemeMode = (): ThemeMode => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // 保存値が読めない環境では端末設定に合わせる
  }
  return "system";
};

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export const applyThemeMode = (mode: ThemeMode) => {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia(DARK_SCHEME_QUERY).matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};

/** 端末の外観設定が変わるたびに「端末に合わせる」のテーマを適用し直す。解除する関数を返す。 */
export const followSystemTheme = (): (() => void) => {
  const media = window.matchMedia(DARK_SCHEME_QUERY);
  const onChange = () => applyThemeMode("system");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

export const SEND_KEY_STORAGE_KEY = "etax-send-key";

export const readStoredSendKeyMode = (): SendKeyMode => {
  try {
    if (localStorage.getItem(SEND_KEY_STORAGE_KEY) === "modEnter") return "modEnter";
  } catch {
    // 保存値が読めない環境では Enter 送信を既定にする
  }
  return "enter";
};

export const YEAR_STORAGE_KEY = "etax-selected-year";

export const readStoredYear = (): number => {
  try {
    const saved = Number(localStorage.getItem(userScopedKey(YEAR_STORAGE_KEY)));
    return Number.isInteger(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
};

export const saveStoredYear = (year: number) => {
  try {
    localStorage.setItem(userScopedKey(YEAR_STORAGE_KEY), String(year));
  } catch {
    // 保存できなくても切替自体は有効にする
  }
};

/** 取引がまだ無いのに追加された年度（年度セレクタの「YYYY年度を追加」）。 */
export const EXTRA_YEARS_STORAGE_KEY = "etax-extra-years";

export const readExtraYears = (): number[] => {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(userScopedKey(EXTRA_YEARS_STORAGE_KEY)) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (y): y is number => typeof y === "number" && Number.isInteger(y) && y >= 1900 && y <= 2100,
    );
  } catch {
    return [];
  }
};

export const saveExtraYears = (years: number[]) => {
  try {
    localStorage.setItem(userScopedKey(EXTRA_YEARS_STORAGE_KEY), JSON.stringify(years));
  } catch {
    // 保存できなくても追加自体は有効にする
  }
};
