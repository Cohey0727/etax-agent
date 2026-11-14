import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    appearance: "none",
    padding: `${theme.component.controlPaddingY} calc(${theme.component.controlPaddingX} + 14px) ${theme.component.controlPaddingY} ${theme.component.controlPaddingX}`,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.color.border}`,
    fontSize: theme.fontSizes.sm,
    fontFamily: "inherit",
    background: theme.color.inputBg,
    // 開く矢印は自前のシェブロンに統一する（ブラウザ標準の矢印は位置・色が揃わないため）。
    backgroundImage:
      "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8aa3' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    color: theme.color.text,
    cursor: "pointer",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    selectors: {
      "&:focus": {
        outline: "none",
        borderColor: theme.color.accent,
        boxShadow: `0 0 0 3px ${theme.color.focusRing}`,
      },
    },
  }),
};

export default styles;
