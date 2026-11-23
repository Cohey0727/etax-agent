/**
 * Theme.ts — 外観テーマの選択肢。
 * light / dark は固定、system は端末の外観設定（prefers-color-scheme）に追随する。
 * 実際の表示は document.documentElement の data-theme 属性で切り替わる。
 */
export type ThemeMode = "light" | "dark" | "system";
