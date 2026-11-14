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

// 左右パネルの幅アニメーション（VS Code のサイドバー開閉と同じ考え方）。
const panelTransition = `width ${theme.animation.durationSlow} ${theme.animation.springSoft}`;

const styles = {
  // アプリシェル: 画面全体を 100dvh に固定し、スクロールは main だけが担う。
  // サイドバー/パネルは sticky に頼らず、シェルの高さいっぱいに伸びて自前で
  // スクロールする（overflow: hidden な祖先があると sticky は効かないため）。
  root: style({
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    overflow: "hidden",
  }),
  shell: style({
    flex: 1,
    minHeight: 0,
    "@media": {
      "(max-width: 900px)": { flexDirection: "column" },
    },
  }),
  // 左サイドバー。レイアウトを占有し、幅で開閉する（内側は固定幅で潰れない）。
  // alignSelf: stretch で行の高さいっぱいに伸ばす。
  sidebar: style({
    width: theme.component.sidebarWidth,
    flexShrink: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    transition: panelTransition,
    "@media": {
      "(max-width: 900px)": { width: "100%" },
    },
  }),
  sidebarClosed: style({
    width: "0px",
    "@media": {
      "(max-width: 900px)": { display: "none" },
    },
  }),
  sidebarInner: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.lg,
    width: theme.component.sidebarWidth,
    height: "100%",
    overflowY: "auto",
    padding: `${theme.space.lg} ${theme.space.md}`,
    background: theme.color.surface,
    borderRight: `1px solid ${theme.color.border}`,
    boxSizing: "border-box",
    "@media": {
      "(max-width: 900px)": {
        width: "100%",
        height: "auto",
        overflowY: "visible",
        borderRight: "none",
        borderBottom: `1px solid ${theme.color.border}`,
      },
    },
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
  // 本体はここだけがスクロールする。
  main: style({
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignSelf: "stretch",
    overflowY: "auto",
    padding: `${theme.space.lg} ${theme.space.xl} ${theme.space.xxl}`,
    "@media": {
      "(max-width: 900px)": {
        width: "100%",
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
  // 右のエージェントパネル。ドロワーではなくレイアウトを占有し、メイン画面と
  // 同時に操作できる。閉じている間もマウントしたままにして会話状態を保つ。
  agentPanel: style({
    width: "0px",
    flexShrink: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    transition: panelTransition,
    "@media": {
      "(max-width: 900px)": { width: "0px" },
    },
  }),
  agentPanelOpen: style({
    width: theme.component.agentPanelWidth,
    "@media": {
      "(max-width: 900px)": { width: "100%" },
    },
  }),
  panelInner: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.md,
    width: theme.component.agentPanelWidth,
    height: "100%",
    padding: theme.space.md,
    background: theme.color.surface,
    borderLeft: `1px solid ${theme.color.border}`,
    boxSizing: "border-box",
    "@media": {
      "(max-width: 900px)": {
        width: "100%",
        height: "auto",
        borderLeft: "none",
        borderTop: `1px solid ${theme.color.border}`,
      },
    },
  }),
  // パネル本体はスクロールさせず、会話ログ側がスクロールして入力欄が下端に残る。
  panelBody: style({
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  }),
  // 画面下部の細いアクションバー（VS Code のステータスバー相当）。
  // fixed ではなくシェルの一部として置く（root が 100dvh のため最下部に残る）。
  // 左右パネルの開閉トグルを置く。
  actionBar: style({
    flexShrink: 0,
    height: theme.component.actionBarHeight,
    background: theme.color.surface,
    borderTop: `1px solid ${theme.color.border}`,
    display: "flex",
    alignItems: "center",
    padding: `0 ${theme.space.md}`,
  }),
  barInner: style({
    flex: 1,
  }),
};

export default styles;
