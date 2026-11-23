import { keyframes, style } from "@vanilla-extract/css";
import { theme } from "@configs";

// スケルトンの明滅（読み込み中であることを静かに示す）。
const skeletonPulse = keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.45 },
});

const styles = {
  // 狭幅（スマホ）では行を潰さず、リスト全体を横スクロールさせる。
  listScroller: style({
    overflowX: "auto",
  }),
  // 独立した項目1件分の行。順序は表さず、状態だけを示す。
  // 項目名・状態・補足は左に寄せて並べる（両端に散らすと隙間が開きすぎる）。
  statusRow: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.space.md,
    minHeight: "24px",
    // ラベル＋チップ＋状態テキストが潰れない最小幅（これより狭ければ横スクロール）。
    minWidth: "24rem",
  }),
  // 項目名＋状態チップ。
  itemLabel: style({
    display: "flex",
    alignItems: "center",
    gap: theme.space.sm,
    fontWeight: theme.fontWeight.semibold,
    flexShrink: 0,
    whiteSpace: "nowrap",
  }),
  // 状態（済み）。
  stateDone: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.color.accentText,
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }),
  // 状態（未）。
  stateTodo: style({
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.color.muted,
    backgroundColor: theme.color.lineSoft,
    borderRadius: theme.borderRadius.pill,
    padding: "2px 8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }),
  // 読み込み中の状態欄のバー。
  skeletonBar: style({
    display: "block",
    width: "64px",
    height: "12px",
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.color.lineSoft,
    animation: `${skeletonPulse} 1.4s ease-in-out infinite`,
  }),
  // 読み込み中のフッター（確定申告画面へのリンクボタン）の placeholder。
  // 実ボタンの行と同じ高さを確保して、出現時のずれをなくす。
  skeletonFooter: style({
    width: "190px",
    height: "32px",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.color.lineSoft,
    animation: `${skeletonPulse} 1.4s ease-in-out infinite`,
  }),
};

export default styles;
