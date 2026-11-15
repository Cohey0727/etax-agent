import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // e-Tax への提出リンク。主ボタン（primary）と同じ見た目にする
  // （薄い色だと「押せないボタン」に見えるため、はっきりした色にする）。
  submitLink: style({
    display: "inline-flex",
    alignItems: "center",
    height: theme.component.controlHeight,
    padding: "0 16px",
    borderRadius: theme.borderRadius.md,
    background: theme.color.accent,
    color: theme.color.onAccent,
    fontWeight: theme.fontWeight.semibold,
    textDecoration: "none",
    transition: `background 0.2s ease, transform 0.25s ${theme.animation.spring}`,
    selectors: {
      "&:hover": {
        background: theme.color.accentHover,
        boxShadow: theme.shadow.button,
        transform: "translateY(-1px) scale(1.03)",
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
