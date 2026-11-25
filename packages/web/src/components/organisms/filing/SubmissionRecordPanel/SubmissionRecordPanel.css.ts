import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  fieldLabel: style({
    flex: "0 0 96px",
  }),
  fieldInput: style({
    width: "220px",
    maxWidth: "100%",
  }),
  // 受信通知PDFへのリンク。ボタンと並んでも押せることが分かる色にする。
  receiptLink: style({
    color: theme.color.accent,
    fontWeight: theme.fontWeight.semibold,
    textDecoration: "none",
    selectors: {
      "&:hover": {
        textDecoration: "underline",
      },
    },
  }),
  hiddenFileInput: style({
    display: "none",
  }),
};

export default styles;
