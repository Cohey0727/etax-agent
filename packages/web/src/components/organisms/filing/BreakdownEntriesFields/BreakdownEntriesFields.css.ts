import { style } from "@vanilla-extract/css";

const styles = {
  // 名称は残りの幅いっぱいに広げる。
  recipient: style({
    flex: 1,
    minWidth: 0,
  }),
  // 金額は固定幅。
  amount: style({
    width: "150px",
    flexShrink: 0,
  }),
};

export default styles;
