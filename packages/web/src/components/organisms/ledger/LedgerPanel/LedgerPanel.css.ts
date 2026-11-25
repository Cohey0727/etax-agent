import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// 「追加」ドロップダウンの出現アニメーション（小さく跳ねる）。
const menuPop = keyframes({
  "0%": { opacity: 0, transform: "scale(0.94) translateY(-4px)" },
  "60%": { opacity: 1, transform: "scale(1.02) translateY(0)" },
  "100%": { opacity: 1, transform: "scale(1) translateY(0)" },
});

// スケルトンの明滅。
const skeletonPulse = keyframes({
  "0%": { opacity: 0.5 },
  "50%": { opacity: 1 },
  "100%": { opacity: 0.5 },
});

// 削除が確定した行の退場（右へ滑りながら消える）。
const rowDelete = keyframes({
  "0%": { opacity: 1, transform: "translateX(0)" },
  "100%": { opacity: 0, transform: "translateX(40px)" },
});

// 削除の武装中を知らせる鼓動。
const armedPulse = keyframes({
  "0%": { transform: "scale(1)" },
  "50%": { transform: "scale(1.14)" },
  "100%": { transform: "scale(1)" },
});

// 検索・フィルター行の高さ。チップの中身（controlHeight）に
// チップの上下 padding と枠線を足したもの。行内の全要素で共有する。
const FILTER_ROW_HEIGHT = `calc(${theme.component.controlHeight} + ${theme.space.xs} * 2 + 2px)`;

const styles = {
  cellInput: style({
    width: "100%",
    minWidth: "76px",
  }),
  // 表の中の入力は詰めて出す（丸み・余白を落として全カラムが収まるように）。
  cellControl: style({
    height: "28px",
    padding: "0 6px",
    borderRadius: "4px",
    fontSize: theme.fontSizes.xs,
  }),
  cellSelect: style({
    height: "28px",
    padding: "0 20px 0 6px",
    borderRadius: "4px",
    fontSize: theme.fontSizes.xs,
    backgroundPosition: "right 6px center",
  }),
  // 操作列はアイコンボタンを必ず横並びにする。表の列幅計算で潰れてボタンが
  // 縦に積まれるのを防ぐため、セルは折り返し禁止、行は内容幅に固定する。
  // 広い画面では右端に固定し、横スクロールしても操作列が隠れないようにする。
  // 狭い画面では固定をやめ、表と一緒にスクロールさせる（固定すると表示領域を圧迫する）。
  actionsCell: style({
    whiteSpace: "nowrap",
    position: "sticky",
    right: 0,
    background: theme.color.surface,
    boxShadow: "-10px 0 14px -10px rgba(34, 26, 99, 0.35)",
    zIndex: 1,
    "@media": {
      "(max-width: 640px)": { position: "static", boxShadow: "none" },
    },
  }),
  actionsHeader: style({
    position: "sticky",
    right: 0,
    background: theme.color.surface,
    boxShadow: "-10px 0 14px -10px rgba(34, 26, 99, 0.35)",
    zIndex: 1,
    "@media": {
      "(max-width: 640px)": { position: "static", boxShadow: "none" },
    },
  }),
  actionsRow: style({
    width: "max-content",
  }),
  // 行操作のアイコンボタン。表の詰めた行高（28px）に合わせた正方形にする。
  iconButton: style({
    width: "28px",
    height: "28px",
    padding: 0,
  }),
  // 削除の武装中はボタンを鼓動させて、状態に気づけるようにする。
  armedButton: style({
    animation: `${armedPulse} 0.9s ease-in-out infinite`,
  }),
  // 削除が確定した行の退場アニメーション。
  rowDeleting: style({
    animation: `${rowDelete} 380ms ${theme.animation.spring} forwards`,
  }),
  // 事業割合の入力行は、% の単位が下に折り返さないよう折り返し禁止にする。
  ratioRow: style({
    flexWrap: "nowrap",
  }),
  ratioUnit: style({
    flexShrink: 0,
  }),
  // 表の受け皿。背景は白（カードと同じ面の色）にし、幅が足りないときは
  // この中で横スクロールさせる。サイドバーやエージェントパネルを開いて
  // 主領域が狭くなっても、列が外へはみ出さないようにする。
  tableWrap: style({
    width: "100%",
    overflowX: "auto",
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadow.card,
  }),
  // 件数・収入・支出・差引の統計カードの並び。
  statGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: theme.space.md,
  }),
  searchWrap: style({
    position: "relative",
    flex: 1,
    maxWidth: "420px",
  }),
  searchIcon: style({
    position: "absolute",
    left: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    color: theme.color.muted,
    pointerEvents: "none",
    display: "flex",
  }),
  searchInput: style({
    width: "100%",
    paddingLeft: "34px",
  }),
  // フィルター追加ボタン。チップと高さを揃える。
  rowButton: style({
    height: FILTER_ROW_HEIGHT,
  }),
  // 枠なしフィルター（期間）。検索の左に、コントロールだけを並べる。
  filterBare: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.xs,
    flexWrap: "wrap",
  }),
  descriptionInput: style({
    width: "100%",
    minWidth: "140px",
  }),
  amountInput: style({
    width: "100%",
    minWidth: "88px",
    textAlign: "right",
  }),
  // 事業割合（家事按分）の入力。% の単位と並べても潰れない幅にする。
  ratioInput: style({
    width: "64px",
    minWidth: "64px",
    textAlign: "right",
  }),
  // 按分根拠メモの入力（割合が100%未満の行だけ出す）。
  basisInput: style({
    width: "100%",
    minWidth: "120px",
  }),
  addGrid: style({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: theme.space.sm,
    alignItems: "end",
  }),
  // 「追加」ボタンとドロップダウンの位置基準。
  addMenuWrap: style({
    position: "relative",
  }),
  // メニュー外クリックで閉じるための全面 backdrop。
  menuBackdrop: style({
    position: "fixed",
    inset: 0,
    zIndex: 30,
  }),
  addMenu: style({
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 31,
    minWidth: "232px",
    padding: theme.space.xs,
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadow.card,
    transformOrigin: "top right",
    animation: `${menuPop} ${theme.animation.durationBase} ${theme.animation.spring}`,
  }),
  menuItem: style({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "9px 10px",
    border: "none",
    borderRadius: theme.borderRadius.sm,
    background: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    fontSize: "14px",
    textAlign: "left",
    cursor: "pointer",
    selectors: {
      "&:hover": { background: theme.color.hover },
    },
  }),
  // フィルター追加メニューは左寄せで開く（ヘッダーの右寄せメニューと対）。
  addMenuLeft: style({
    right: "auto",
    left: 0,
    transformOrigin: "top left",
  }),
  menuNote: style({
    display: "block",
    padding: "9px 10px",
  }),
  // フィルター1件分のチップ。項目名＋条件入力＋削除をひとまとめにする。
  filterChip: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.xs,
    // チップ内のテキスト（項目名）は折り返さない。
    whiteSpace: "nowrap",
    flexShrink: 0,
    // 中身（Select/Input=controlHeight）に上下 padding と枠線を足した高さで固定し、
    // チップ同士・隣のボタンと高さがズレないようにする。
    height: FILTER_ROW_HEIGHT,
    padding: `${theme.space.xs} ${theme.space.sm}`,
    background: theme.color.surface,
    border: `1px solid ${theme.color.border}`,
    borderRadius: theme.borderRadius.pill,
    flexWrap: "wrap",
  }),
  chipInput: style({
    width: "138px",
  }),
  chipNumber: style({
    width: "92px",
  }),
  chipSelect: style({
    minWidth: "104px",
  }),
  chipRemove: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    padding: 0,
    border: "none",
    borderRadius: theme.borderRadius.pill,
    background: "transparent",
    color: theme.color.muted,
    cursor: "pointer",
    selectors: {
      "&:hover": { background: theme.color.hover, color: theme.color.text },
    },
  }),
  // 読み込み中スケルトンの土台。
  skeleton: style({
    background: theme.color.lineSoft,
    borderRadius: theme.borderRadius.sm,
    animation: `${skeletonPulse} 1.4s ease-in-out infinite`,
  }),
  skeletonTitle: style({
    width: "180px",
    height: "24px",
  }),
  skeletonButton: style({
    width: "120px",
    height: "32px",
  }),
  skeletonLabel: style({
    width: "55%",
    height: "12px",
  }),
  skeletonValue: style({
    width: "80%",
    height: "24px",
  }),
  skeletonSearch: style({
    width: "420px",
    maxWidth: "100%",
    height: "36px",
  }),
  skeletonRow: style({
    height: "20px",
  }),
};

// 帳簿テーブルはセルの余白も詰める（全カラムが収まるように）。
// Table atom 側の指定（クラス+要素）より詳細度を上げて確実に効かせる。
globalStyle(`${styles.tableWrap} table th, ${styles.tableWrap} table td`, {
  padding: "4px 3px",
  verticalAlign: "middle",
});

// 統計カードは左から順に少しずつ遅れて弾んで現れる（Card の登場アニメーションへの遅延）。
globalStyle(`${styles.statGrid} > *:nth-child(2)`, { animationDelay: "0.05s" });
globalStyle(`${styles.statGrid} > *:nth-child(3)`, { animationDelay: "0.1s" });
globalStyle(`${styles.statGrid} > *:nth-child(4)`, { animationDelay: "0.15s" });

export default styles;
