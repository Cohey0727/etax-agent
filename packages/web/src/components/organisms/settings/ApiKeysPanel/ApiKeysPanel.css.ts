import { style } from "@vanilla-extract/css";

const styles = {
  // 発行直後のキー表示欄。長いキーが見切れないよう、行の残り幅いっぱいに広げる。
  keyInput: style({
    flex: 1,
    minWidth: 0,
  }),
};

export default styles;
