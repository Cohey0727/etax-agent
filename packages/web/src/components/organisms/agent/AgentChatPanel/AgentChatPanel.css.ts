import { globalStyle, keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// チャットの吹き出しは追加時にぽよんと弾んで現れる。
const bubbleIn = keyframes({
  "0%": { opacity: 0, transform: "translateY(8px) scale(0.92)" },
  "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
});

const styles = {
  // パネル全体。枠（Card）は付けず、会話が伸びて入力欄が一番下に残る縦フレックス。
  root: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.md,
    flex: "1 1 auto",
    minHeight: 0,
  }),
  // 会話ログだけがスクロールする。
  chatLog: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.sm,
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    paddingRight: theme.space.xs,
    "@media": {
      "(max-width: 900px)": {
        maxHeight: "55vh",
      },
    },
  }),
  bubble: style({
    padding: "10px 14px",
    borderRadius: theme.borderRadius.md,
    whiteSpace: "pre-wrap",
    maxWidth: "85%",
    animation: `${bubbleIn} 0.4s ${theme.animation.spring} both`,
  }),
  role: styleVariants({
    user: {
      background: theme.color.accentSoft,
      borderBottomRightRadius: "4px",
      alignSelf: "flex-end",
    },
    assistant: {
      background: theme.color.surface,
      border: `1px solid ${theme.color.lineSoft}`,
      borderBottomLeftRadius: "4px",
      boxShadow: theme.shadow.card,
      alignSelf: "flex-start",
    },
  }),
  // エージェント返信のマークダウン/HTML本文。要素の間隔は末尾の globalStyle で整える。
  markdown: style({
    whiteSpace: "normal",
    wordBreak: "break-word",
  }),
  // 入力欄はパネルの一番下に固定（縮まない）。
  inputRow: style({
    flexShrink: 0,
  }),
  inputFlex: style({
    flex: 1,
  }),
  // 履歴一覧の1行。幅いっぱいに広げて左寄せにする。
  sessionItem: style({
    width: "100%",
    justifyContent: "flex-start",
    textAlign: "left",
    height: "auto",
    padding: `${theme.space.sm} ${theme.space.md}`,
  }),
};

// マークダウン本文の要素スタイル（子孫セレクタは globalStyle で付ける）。
const md = styles.markdown;
globalStyle(`${md} p`, { margin: 0 });
globalStyle(`${md} p + p`, { marginTop: theme.space.sm });
globalStyle(`${md} ul`, {
  margin: `${theme.space.xs} 0`,
  paddingLeft: "20px",
  listStyleType: "disc",
});
globalStyle(`${md} ol`, {
  margin: `${theme.space.xs} 0`,
  paddingLeft: "20px",
  listStyleType: "decimal",
});
globalStyle(`${md} li`, { margin: "2px 0" });
globalStyle(`${md} li > p`, { margin: 0 });
globalStyle(`${md} strong`, { fontWeight: theme.fontWeight.bold });
globalStyle(`${md} a`, { color: theme.color.accentText, textDecoration: "underline" });
globalStyle(`${md} code`, {
  backgroundColor: theme.color.bg,
  borderRadius: theme.borderRadius.sm,
  padding: "1px 5px",
  fontSize: theme.fontSizes.sm,
});
globalStyle(`${md} pre`, {
  backgroundColor: theme.color.bg,
  borderRadius: theme.borderRadius.md,
  padding: theme.space.md,
  overflowX: "auto",
  margin: `${theme.space.sm} 0`,
});
globalStyle(`${md} pre code`, { backgroundColor: "transparent", padding: 0 });
globalStyle(`${md} table`, {
  borderCollapse: "collapse",
  fontSize: theme.fontSizes.sm,
  margin: `${theme.space.sm} 0`,
});
globalStyle(`${md} th`, {
  border: `1px solid ${theme.color.border}`,
  padding: "4px 8px",
  textAlign: "left",
});
globalStyle(`${md} td`, {
  border: `1px solid ${theme.color.border}`,
  padding: "4px 8px",
});
globalStyle(`${md} blockquote`, {
  margin: `${theme.space.sm} 0`,
  paddingLeft: theme.space.md,
  borderLeft: `3px solid ${theme.color.borderStrong}`,
  color: theme.color.textSubtle,
});
globalStyle(`${md} h1, ${md} h2, ${md} h3, ${md} h4`, {
  margin: `${theme.space.sm} 0 ${theme.space.xs}`,
  fontWeight: theme.fontWeight.bold,
});
globalStyle(`${md} hr`, {
  border: "none",
  borderTop: `1px solid ${theme.color.border}`,
  margin: `${theme.space.md} 0`,
});

export default styles;
