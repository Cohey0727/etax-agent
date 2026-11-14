import { createGlobalTheme } from "@vanilla-extract/css";

export const theme = createGlobalTheme(":root", {
  color: {
    bg: "#f6f6f4",
    card: "#ffffff",
    border: "#ddd9d2",
    text: "#1f2937",
    muted: "#6b7280",
    accent: "#2b5ea7",
    accentSoft: "#e8eff8",
    positive: "#15803d",
    negative: "#b91c1c",
    barStandard: "#64748b",
    barSimplified: "#2b5ea7",
    barSpecial: "#0e9f6e",
    warnBg: "#fef9e7",
    warnBorder: "#e5c07b",
    errorBg: "#fdf0f0",
    errorBorder: "#e5a3a3",
  },
  space: {
    sm: "8px",
    md: "16px",
    lg: "24px",
  },
  borderRadius: {
    sm: "6px",
    md: "10px",
  },
  fontSizes: {
    xs: "12px",
    sm: "13px",
    base: "14px",
    lg: "15px",
    xl: "20px",
    xxl: "24px",
  },
});
