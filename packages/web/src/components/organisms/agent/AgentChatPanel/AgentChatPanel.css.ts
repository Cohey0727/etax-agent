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
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: theme.space.sm,
    flex: "1 1 auto",
    minHeight: 0,
  }),
  // ファイルをドラッグしている間の受け口表示。操作は背後へ通さない。
  dropOverlay: style({
    position: "absolute",
    inset: 0,
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
    background: theme.color.accentSoft,
    border: `2px dashed ${theme.color.accent}`,
    borderRadius: theme.borderRadius.md,
    pointerEvents: "none",
    animation: `${bubbleIn} 0.25s ${theme.animation.spring} both`,
  }),
  // 送信前の添付チップの並び。
  attachmentList: style({
    display: "flex",
    flexWrap: "wrap",
    gap: theme.space.xs,
    flexShrink: 0,
  }),
  attachmentChip: style({
    display: "inline-flex",
    alignItems: "center",
    gap: theme.space.xs,
    background: theme.color.accentSoft,
    color: theme.color.accentText,
    borderRadius: theme.borderRadius.sm,
    padding: "2px 4px 2px 8px",
    fontSize: theme.fontSizes.xs,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    maxWidth: "100%",
  }),
  attachmentName: style({
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  attachmentRemove: style({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    borderRadius: theme.borderRadius.sm,
  }),
  hiddenFileInput: style({
    display: "none",
  }),
  // 送信済みの発言に添えた添付チップ（吹き出し地の上でも読めるよう面色を変える）。
  bubbleAttachments: style({
    display: "flex",
    flexWrap: "wrap",
    gap: theme.space.xs,
    marginTop: theme.space.xs,
  }),
  bubbleAttachmentChip: style({
    display: "inline-flex",
    alignItems: "center",
    gap: theme.space.xs,
    background: theme.color.surface,
    color: theme.color.accentText,
    borderRadius: theme.borderRadius.sm,
    padding: "2px 8px",
    fontSize: theme.fontSizes.xs,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    maxWidth: "100%",
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
  // 助手の発言ブロック（吹き出し＋使ったツールの一覧）。
  assistantBlock: style({
    display: "flex",
    flexDirection: "column",
    gap: theme.space.xs,
    alignSelf: "flex-start",
    maxWidth: "85%",
  }),
  assistantBubble: style({
    maxWidth: "100%",
  }),
  // 使ったツールの一覧。発言の下にチップで並べる。
  toolList: style({
    display: "flex",
    flexWrap: "wrap",
    gap: theme.space.xs,
  }),
  toolChip: style({
    background: theme.color.accentSoft,
    color: theme.color.accentText,
    borderRadius: theme.borderRadius.sm,
    padding: "2px 8px",
    fontSize: theme.fontSizes.xs,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    flexShrink: 0,
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
