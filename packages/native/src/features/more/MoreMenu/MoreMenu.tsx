import { Href, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, BouncePressable, Card, LineIcon, LineIconName } from "@/components";
import { colors, radius, space } from "@/theme";

// タブに出していない画面への導線（ダッシュボードと、Web 版サイドバーの残りの項目）。
const MORE_ITEMS: readonly { href: Href; label: string; icon: LineIconName }[] = [
  { href: "/", label: "ダッシュボード", icon: "grid" },
  { href: "/reports", label: "試算表", icon: "bill" },
  { href: "/cashflow", label: "資金繰り", icon: "chart" },
  { href: "/assets", label: "固定資産", icon: "building" },
  { href: "/invoices", label: "請求書", icon: "receipt" },
  { href: "/taxpayer", label: "納税者情報", icon: "user" },
  { href: "/mcp-settings", label: "MCP設定", icon: "settings" },
];

/** 「その他」画面のメニューリスト。 */
export function MoreMenu() {
  const router = useRouter();
  return (
    <Card style={styles.card} noEnter>
      {MORE_ITEMS.map((item, index) => (
        <BouncePressable
          key={item.label}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={() => router.push(item.href)}
          style={[styles.row, index < MORE_ITEMS.length - 1 && styles.rowDivider]}
        >
          <View style={styles.iconTile}>
            <LineIcon name={item.icon} size={19} color={colors.accent} />
          </View>
          <AppText size="md" weight="semibold" style={styles.label}>
            {item.label}
          </AppText>
          <LineIcon name="chevronRight" size={16} color={colors.muted} />
        </BouncePressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xs, gap: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm + 2,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1 },
});
