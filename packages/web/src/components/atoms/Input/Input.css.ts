import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  root: style({
    // 固有幅に引きずられない（flex 子要素では min-width:auto が固有幅を下限にしてしまい、
    // 狭い画面で親をはみ出すため。Select と同じ）。
    minWidth: 0,
    maxWidth: "100%",
    // 高さは Select・Button と共通の controlHeight に固定する（縦 padding は持たず、行ボックスで中央に置く）。
    height: theme.component.controlHeight,
    padding: `0 ${theme.component.controlPaddingX}`,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.color.border}`,
    fontSize: theme.fontSizes.sm,
    fontFamily: "inherit",
    "@media": {
      // iOS Safari は 16px 未満の入力欄でフォーカス時に自動ズームするため、狭い画面では 16px にする。
      "(max-width: 640px)": { fontSize: "16px" },
    },
    background: theme.color.inputBg,
    color: theme.color.text,
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
