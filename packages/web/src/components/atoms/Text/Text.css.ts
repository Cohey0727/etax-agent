import { styleVariants } from "@vanilla-extract/css";
import { theme } from "@configs";

const styles = {
  variant: styleVariants({
    body: { fontSize: theme.fontSizes.base },
    muted: { fontSize: theme.fontSizes.base, color: theme.color.muted },
    caption: { fontSize: theme.fontSizes.xs, color: theme.color.muted },
    statLabel: { fontSize: theme.fontSizes.xs, color: theme.color.muted },
    statValue: { fontSize: theme.fontSizes.xl, fontWeight: 700 },
    sectionTitle: { fontSize: theme.fontSizes.lg, fontWeight: 700 },
    title: { fontSize: theme.fontSizes.xxl, fontWeight: 700 },
  }),
};

export default styles;
