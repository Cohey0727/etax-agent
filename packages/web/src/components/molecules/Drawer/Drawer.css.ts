import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 背景はふわりと、パネルは右からバウンスして滑り込む。
const fadeIn = keyframes({
  "0%": { opacity: 0 },
  "100%": { opacity: 1 },
});

const slideIn = keyframes({
  "0%": { transform: "translateX(72px)", opacity: 0 },
  "60%": { transform: "translateX(-8px)", opacity: 1 },
  "100%": { transform: "translateX(0)", opacity: 1 },
});

const styles = {
  // 画面全体を覆う固定レイヤー。背景とパネルを横に並べ、パネルを右端へ寄せる。
  root: style({
    position: "fixed",
    inset: 0,
    zIndex: 70,
    display: "flex",
    justifyContent: "flex-end",
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
    height: "100%",
    background: theme.color.surface,
    boxShadow: theme.shadow.cardHover,
    animation: `${slideIn} 0.45s ${theme.animation.spring} both`,
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
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    padding: theme.space.lg,
  }),
};

export default styles;
