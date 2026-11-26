import { Href } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, BouncePressable, Card } from "@/components";
import { colors, radius, space } from "@/theme";

export interface MenuGridProps {
  onNavigate: (href: Href) => void;
}

const MENU_ITEMS: readonly { href: Href; label: string; mark: string }[] = [
  { href: "/ledger", label: "帳簿", mark: "帳" },
  { href: "/import", label: "取込", mark: "込" },
  { href: "/receipt", label: "領収書", mark: "領" },
  { href: "/reports", label: "試算表", mark: "試" },
  { href: "/cashflow", label: "資金繰り", mark: "資" },
  { href: "/assets", label: "固定資産", mark: "固" },
  { href: "/invoices", label: "請求書", mark: "請" },
  { href: "/taxpayer", label: "納税者情報", mark: "納" },
  { href: "/filing", label: "確定申告", mark: "申" },
  { href: "/mcp-settings", label: "MCP設定", mark: "M" },
  { href: "/settings", label: "設定", mark: "設" },
  { href: "/agent", label: "AIエージェント", mark: "AI" },
];

/** 各画面へのメニューグリッド。 */
export function MenuGrid({ onNavigate }: MenuGridProps) {
  return (
    <Card>
      <AppText size="lg" weight="bold">
        メニュー
      </AppText>
      <View style={styles.grid}>
        {MENU_ITEMS.map((item) => (
          <BouncePressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => onNavigate(item.href)}
            style={styles.cell}
          >
            <View style={styles.mark}>
              <AppText size="sm" weight="bold" tone="accent">
                {item.mark}
              </AppText>
            </View>
            <AppText size="sm" weight="semibold" numberOfLines={1}>
              {item.label}
            </AppText>
          </BouncePressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: {
    width: "31%",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
