import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// チャットの吹き出しは追加時にぽよんと弾んで現れる。
const bubbleIn = keyframes({
  "0%": { opacity: 0, transform: "translateY(8px) scale(0.92)" },
  "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
});

const styles = {
  chatLog: style({
    maxHeight: theme.component.chatLogMaxHeight,
    overflowY: "auto",
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
  inputFlex: style({
    flex: 1,
  }),
};

export default styles;
