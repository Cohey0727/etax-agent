import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 画面切替時はバネでふわりと浮き上がる（少し行き過ぎて戻る）。
const springRise = keyframes({
  "0%": { opacity: 0, transform: "translateY(16px) scale(0.995)" },
  "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
});

// ブランドマークの登場ポップ。
const popIn = keyframes({
  "0%": { transform: "scale(0.6)" },
  "60%": { transform: "scale(1.12)" },
  "100%": { transform: "scale(1)" },
});

// ブランドマークのゆるやかな上下動。
const bob = keyframes({
  "0%, 100%": { transform: "translateY(0)" },
  "50%": { transform: "translateY(-2.5px)" },
});

const styles = {
  shell: style({
    minHeight: "100vh",
    "@media": {
      "(max-width: 900px)": { flexDirection: "column" },
    },
  }),
  sidebar: style({
    width: theme.component.sidebarWidth,
    flexShrink: 0,
    background: theme.color.surface,
    borderRight: `1px solid ${theme.color.border}`,
    padding: `${theme.space.lg} ${theme.space.md}`,
    position: "sticky",
    top: 0,
    height: "100vh",
    "@media": {
      "(max-width: 900px)": {
        width: "100%",
        height: "auto",
        position: "static",
        borderRight: "none",
        borderBottom: `1px solid ${theme.color.border}`,
      },
    },
  }),
  sidebarInner: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.lg,
    height: "100%",
  }),
  brandMark: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: theme.component.brandMarkSize,
    height: theme.component.brandMarkSize,
    borderRadius: "11px",
    background: `linear-gradient(135deg, ${theme.color.gradientStart} 0%, ${theme.color.accent} 100%)`,
    color: theme.color.onAccent,
    fontSize: "19px",
    fontWeight: theme.fontWeight.bold,
    lineHeight: 1,
    boxShadow: theme.shadow.button,
    flexShrink: 0,
    animation: `${popIn} 0.5s ${theme.animation.spring} both, ${bob} 3.2s ease-in-out 0.7s infinite`,
  }),
  yearSelect: style({
    width: "100%",
  }),
  spacer: style({ flex: 1 }),
  dataPanel: style({
    background: theme.color.bg,
    borderRadius: theme.borderRadius.md,
    padding: `${theme.space.sm} ${theme.space.md}`,
  }),
  main: style({
    flex: 1,
    minWidth: 0,
    padding: `${theme.space.lg} ${theme.space.xl} ${theme.space.xxl}`,
    "@media": {
      "(max-width: 900px)": {
        padding: `${theme.space.md} ${theme.space.md} ${theme.space.xl}`,
      },
    },
  }),
  mainInner: style({
    maxWidth: theme.component.contentMaxWidth,
    margin: "0 auto",
  }),
  view: style({
    animation: `${springRise} 0.5s ${theme.animation.springSoft} both`,
  }),
  footer: style({
    borderTop: `1px solid ${theme.color.lineSoft}`,
    paddingTop: theme.space.md,
    marginTop: theme.space.lg,
  }),
  // エージェントの右ドロワー。閉じている間もマウントしたままにして会話状態を保つ。
  scrim: style({
    position: "fixed",
    inset: 0,
    background: theme.color.scrim,
    opacity: 0,
    pointerEvents: "none",
    transition: `opacity ${theme.animation.durationBase} ease`,
    zIndex: theme.zIndex.scrim,
  }),
  scrimOpen: style({
    opacity: 1,
    pointerEvents: "auto",
  }),
  drawer: style({
    position: "fixed",
    top: 0,
    right: 0,
    width: theme.component.drawerWidth,
    maxWidth: "92vw",
    height: "100dvh",
    background: theme.color.surface,
    borderLeft: `1px solid ${theme.color.border}`,
    boxShadow: theme.shadow.drawer,
    transform: "translateX(105%)",
    transition: `transform 0.5s ${theme.animation.springSoft}`,
    zIndex: theme.zIndex.drawer,
    visibility: "hidden",
  }),
  drawerOpen: style({
    transform: "translateX(0)",
    visibility: "visible",
  }),
  drawerInner: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.md,
    height: "100%",
    padding: `${theme.space.md}`,
  }),
  drawerBody: style({
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
  }),
};

export default styles;
