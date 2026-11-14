import { style, styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  chatLog: style({
    maxHeight: "480px",
    overflowY: "auto",
  }),
  bubble: style({
    padding: "10px 12px",
    borderRadius: theme.borderRadius.md,
    whiteSpace: "pre-wrap",
    maxWidth: "85%",
  }),
  role: styleVariants({
    user: {
      background: theme.color.accentSoft,
      alignSelf: "flex-end",
    },
    assistant: {
      background: theme.color.card,
      border: `1px solid ${theme.color.border}`,
      alignSelf: "flex-start",
    },
  }),
  inputFlex: style({
    flex: 1,
  }),
};

export default styles;
