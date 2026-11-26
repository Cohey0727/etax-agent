import { Href } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, BouncePressable, Card, LineIcon, LineIconName } from "@/components";
import { colors, radius, space } from "@/theme";

export interface MenuGridProps {
  onNavigate: (href: Href) => void;
}

// Web 版サイドバーのナビ項目と同構成・同順序（ダッシュボード自身は除く）。
// 取込・領収書は Web 版と同様にサイドバーへ出さず、帳簿の追加導線から入る。
const MENU_ITEMS: readonly { href: Href; label: string; icon: LineIconName }[] = [
  { href: "/ledger", label: "帳簿", icon: "book" },
  { href: "/reports", label: "試算表", icon: "bill" },
  { href: "/cashflow", label: "資金繰り", icon: "chart" },
  { href: "/assets", label: "固定資産", icon: "building" },
  { href: "/invoices", label: "請求書", icon: "receipt" },
  { href: "/taxpayer", label: "納税者情報", icon: "user" },
  { href: "/filing", label: "確定申告", icon: "fileCheck" },
  { href: "/mcp-settings", label: "MCP設定", icon: "settings" },
  { href: "/settings", label: "設定", icon: "settings" },
  { href: "/agent", label: "AIエージェント", icon: "agent" },
];

/** 各画面へのメニュー。Web 版サイドバーと同じ並びのリスト形式。 */
export function MenuGrid({ onNavigate }: MenuGridProps) {
  return (
    <Card style={styles.card} noEnter>
      {MENU_ITEMS.map((item, index) => (
        <BouncePressable
          key={item.label}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={() => onNavigate(item.href)}
          style={[styles.row, index < MENU_ITEMS.length - 1 && styles.rowDivider]}
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
