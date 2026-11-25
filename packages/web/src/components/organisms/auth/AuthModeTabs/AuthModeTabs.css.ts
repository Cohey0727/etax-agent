import { style } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  // ピル型の土台に2つのタブを等幅で並べる。
  root: style({
    padding: "4px",
    borderRadius: theme.borderRadius.pill,
    background: theme.color.hover,
  }),
  tab: style({
    flex: 1,
  }),
};

export default styles;
