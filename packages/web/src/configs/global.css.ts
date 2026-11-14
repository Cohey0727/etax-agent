import { globalStyle } from "@vanilla-extract/css";
import { theme } from "./theme.css";

globalStyle("body", {
  margin: 0,
  fontFamily:
    "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif",
  background: theme.color.bg,
  color: theme.color.text,
  fontSize: theme.fontSizes.base,
  lineHeight: 1.6,
});

globalStyle("*", { boxSizing: "border-box" });
