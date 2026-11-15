import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // e-Tax への提出リンク。ボタンの高さ（controlHeight）に揃える。
  submitLink: style({
    display: "inline-flex",
    alignItems: "center",
    height: theme.component.controlHeight,
    padding: "0 16px",
    borderRadius: theme.borderRadius.md,
    background: theme.color.accentSoft,
    color: theme.color.accentText,
    fontWeight: theme.fontWeight.semibold,
    textDecoration: "none",
    transition: `background 0.2s ease, transform 0.25s ${theme.animation.spring}`,
    selectors: {
      "&:hover": {
        background: theme.color.hover,
      },
      "&:active": {
        transform: "scale(0.97)",
      },
    },
  }),
  // QRコードの台紙。読み取りやすく白地に余白を付ける。
  qrBox: style({
    flex: "0 0 auto",
    padding: "10px",
    background: "#ffffff",
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.md,
    lineHeight: 0,
  }),
};

export default styles;
