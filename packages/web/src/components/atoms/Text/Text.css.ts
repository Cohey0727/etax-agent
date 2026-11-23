import { styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

// 文字スタイルはこのバリアント集が唯一の出所。大きさ・太さ・行間・字間はトークンから引く。
const styles = {
  variant: styleVariants({
    body: { fontSize: theme.fontSizes.base },
    muted: { fontSize: theme.fontSizes.base, color: theme.color.muted },
    caption: {
      fontSize: theme.fontSizes.xs,
      color: theme.color.muted,
      lineHeight: theme.lineHeight.snug,
    },
    statLabel: {
      fontSize: theme.fontSizes.xs,
      color: theme.color.muted,
      letterSpacing: theme.letterSpacing.wide,
    },
    statValue: {
      fontSize: theme.fontSizes.xl,
      fontWeight: theme.fontWeight.bold,
      fontVariantNumeric: "tabular-nums",
      letterSpacing: theme.letterSpacing.tight,
    },
    sectionTitle: {
      fontSize: theme.fontSizes.lg,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: theme.letterSpacing.snug,
    },
    title: {
      fontSize: theme.fontSizes.xxl,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: theme.letterSpacing.tight,
      lineHeight: theme.lineHeight.tight,
    },
  }),
};

export default styles;
