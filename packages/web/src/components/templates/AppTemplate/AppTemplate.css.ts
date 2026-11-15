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
      // 狭い画面ではレイアウトを占有せず、左からせり出すドロワーにする。
      "(max-width: 900px)": {
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: theme.component.sidebarWidth,
        zIndex: 50,
        transform: "translateX(0)",
        transition: `transform ${theme.animation.durationSlow} ${theme.animation.springSoft}`,
        boxShadow: theme.shadow.cardHover,
      },
    },
  }),
  // 閉じた状態は完全には隠さず、アイコンだけの細いレールにする。
  // 狭い画面ではレールは出さず、ドロワーごと画面外へ退ける。
  sidebarClosed: style({
    width: theme.component.sidebarRailWidth,
    "@media": {
      "(max-width: 900px)": {
        width: theme.component.sidebarWidth,
        transform: "translateX(-105%)",
      },
    },
  }),
  // ドロワーを開いたときの背面。タップで閉じる。狭い画面でのみ描画される。
  backdrop: style({
    position: "fixed",
    inset: 0,
    background: "rgba(23, 20, 54, 0.45)",
    zIndex: 40,
  }),
  // レール内側。ブランドマークとナビのアイコンボタンだけを縦に並べる。
  railInner: style({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.space.lg,
    width: theme.component.sidebarRailWidth,
    height: "100%",
    overflowY: "auto",
    padding: `${theme.space.lg} 0`,
    background: theme.color.surface,
    borderRight: `1px solid ${theme.color.border}`,
    boxSizing: "border-box",
  }),
  railNav: style({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.space.sm,
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
      // ドロワーの中身はデスクトップと同じ縦レイアウトのまま全高で出す。
      "(max-width: 900px)": {
        width: theme.component.sidebarWidth,
        height: "100%",
        overflowY: "auto",
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
  // 画面にぶら下がる子項目（ネスト）の受け皿。左の罫線と字下げで階層を出す。
  navChildren: style({
    marginLeft: theme.space.md,
    paddingLeft: theme.space.sm,
    borderLeft: `1px solid ${theme.color.lineSoft}`,
  }),
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
  // 右のエージェントパネル。ドロワーではなくレイアウトを占有し、メイン画面と
  // 同時に操作できる。閉じている間もマウントしたままにして会話状態を保つ。
  agentPanel: style({
    width: "0px",
    flexShrink: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    transition: panelTransition,
    "@media": {
      // 狭い画面では右からせり出すフルドロワーにする（サイドバーと同じ）。
      "(max-width: 900px)": {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 100vw)",
        zIndex: 50,
        transform: "translateX(105%)",
        transition: `transform ${theme.animation.durationSlow} ${theme.animation.springSoft}`,
        boxShadow: theme.shadow.cardHover,
      },
    },
  }),
  agentPanelOpen: style({
    width: theme.component.agentPanelWidth,
    "@media": {
      "(max-width: 900px)": {
        width: "min(420px, 100vw)",
        transform: "translateX(0)",
      },
    },
  }),
  panelInner: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.sm,
    width: theme.component.agentPanelWidth,
    height: "100%",
    padding: theme.space.md,
    background: theme.color.surface,
    borderLeft: `1px solid ${theme.color.border}`,
    boxSizing: "border-box",
    "@media": {
      // ドロワー内は全高。会話ログが伸びて入力欄が下端に残る。
      "(max-width: 900px)": {
        width: "100%",
        height: "100%",
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
