/**
 * theme.ts — デザイントークン。色は意味で命名し、地は淡いラベンダーグレー、
 * 面は白、基調は濃紺ネイビー、アクセントはインディゴ1色に統一する。
 */

export const colors = {
  bg: "#f3f3f9",
  surface: "#ffffff",
  inputBg: "#ffffff",
  border: "#e4e4f0",
  borderStrong: "#cdcbe6",
  lineSoft: "#eeeef6",
  hover: "#efeff8",
  text: "#1d1d2b",
  textSubtle: "#4e4e63",
  muted: "#5d5d72",
  onAccent: "#ffffff",
  accent: "#4a3aff",
  accentHover: "#3d2fe0",
  accentSoft: "#eeecff",
  accentText: "#4a3aff",
  navy: "#221a63",
  navyDeep: "#18124d",
  onNavy: "#ffffff",
  onNavySubtle: "rgba(255, 255, 255, 0.68)",
  lavender: "#8f84ff",
  lavenderLight: "#a79dff",
  positive: "#1f9d66",
  negative: "#e5484d",
  barStandard: "#c7c3f7",
  barSimplified: "#4a3aff",
  barSpecial: "#8f84ff",
  warnBg: "#fff7e0",
  warnBorder: "#f0d48a",
  warnText: "#7a5b00",
  errorBg: "#fdecec",
  errorBorder: "#f3b4b4",
  errorText: "#b3261e",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
} as const;

/** ウェイト別のフォントファミリ名（フォントファイルはウェイトごとに同梱）。 */
export const fontFamily = {
  regular: "IBMPlexSansJP-400",
  medium: "IBMPlexSansJP-500",
  semibold: "IBMPlexSansJP-600",
  bold: "IBMPlexSansJP-700",
} as const;

export type FontWeightName = keyof typeof fontFamily;

/** スプリングのプリセット。動きはバウンス系で統一する。 */
export const springs = {
  /** 標準のバウンス（登場・選択）。 */
  bouncy: { damping: 13, stiffness: 190, mass: 0.9 },
  /** 柔らかいバウンス（画面遷移・大きな要素）。 */
  soft: { damping: 17, stiffness: 150, mass: 1 },
  /** 硬めのバウンス（押下・小さな要素）。 */
  hard: { damping: 11, stiffness: 320, mass: 0.7 },
} as const;

export const cardShadow = {
  shadowColor: "#221a63",
  shadowOffset: { width: 0, height: 7 },
  shadowOpacity: 0.1,
  shadowRadius: 17,
  elevation: 3,
} as const;
