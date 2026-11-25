import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 背景はふわりと、パネルは中央にバウンスして現れる。
const fadeIn = keyframes({
  "0%": { opacity: 0 },
  "100%": { opacity: 1 },
});

const popIn = keyframes({
  "0%": { transform: "scale(0.92) translateY(10px)", opacity: 0 },
  "60%": { transform: "scale(1.02) translateY(-2px)", opacity: 1 },
  "100%": { transform: "scale(1) translateY(0)", opacity: 1 },
});

const styles = {
  // 画面全体を覆う固定レイヤー。パネルを中央に置く。
  root: style({
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.md,
  }),
  overlay: style({
    position: "absolute",
    inset: 0,
    background: "rgba(15, 13, 40, 0.45)",
    animation: `${fadeIn} 0.25s ease both`,
  }),
  panel: style({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    width: "min(480px, 94vw)",
    maxHeight: "90vh",
    background: theme.color.surface,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadow.cardHover,
    animation: `${popIn} 0.4s ${theme.animation.spring} both`,
  }),
  header: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.md,
    padding: `${theme.space.md} ${theme.space.lg}`,
    borderBottom: `1px solid ${theme.color.lineSoft}`,
    flexShrink: 0,
  }),
  title: style({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  body: style({
    overflowY: "auto",
    padding: theme.space.lg,
  }),
};

export default styles;
