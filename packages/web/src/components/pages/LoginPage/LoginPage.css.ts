import { style } from "@vanilla-extract/css";

// 左右分割の土台。狭い画面ではブランドを上、フォームを下に積む。
const styles = {
  root: style({
    display: "flex",
    minHeight: "100dvh",
    "@media": {
      "(max-width: 900px)": { flexDirection: "column" },
    },
  }),
};

export default styles;
