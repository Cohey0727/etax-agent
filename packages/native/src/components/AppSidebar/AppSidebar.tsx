import { Href, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../AppText";
import { LineIcon, LineIconName } from "../LineIcon";
import { SorobanMark } from "../SorobanMark";
import { useSidebar } from "@/state/SidebarContext";
import { colors, radius, space } from "@/theme";

interface SidebarItem {
  href: Href;
  label: string;
  icon: LineIconName;
}

// Web版サイドバーと同じ構成・順序。
const ITEMS: readonly SidebarItem[] = [
  { href: "/", label: "ダッシュボード", icon: "grid" },
  { href: "/ledger", label: "帳簿", icon: "book" },
  { href: "/reports", label: "試算表", icon: "bill" },
  { href: "/cashflow", label: "資金繰り", icon: "chart" },
  { href: "/assets", label: "固定資産", icon: "building" },
  { href: "/invoices", label: "請求書", icon: "receipt" },
  { href: "/taxpayer", label: "納税者情報", icon: "user" },
  { href: "/filing", label: "確定申告", icon: "fileCheck" },
  { href: "/agent", label: "チャット", icon: "agent" },
  { href: "/mcp-settings", label: "MCP設定", icon: "settings" },
  { href: "/settings", label: "設定", icon: "settings" },
];

const PANEL_WIDTH = 284;

/** 左からスライドインするサイドバーメニュー。 */
export function AppSidebar() {
  const { sidebarOpen, closeSidebar } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (sidebarOpen) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMounted(false);
        },
      );
    }
  }, [sidebarOpen, mounted, anim]);

  if (!mounted) return null;

  const go = (href: Href) => {
    closeSidebar();
    if (pathname !== href) router.navigate(href);
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: anim }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="メニューを閉じる"
          style={StyleSheet.absoluteFill}
          onPress={closeSidebar}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.md,
            transform: [
              {
                translateX: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-PANEL_WIDTH, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.brand}>
          <View style={styles.logoTile}>
            <SorobanMark width={26} />
          </View>
          <AppText size="lg" weight="bold">
            eTaxAgent
          </AppText>
        </View>
        <View style={styles.list}>
          {ITEMS.map((item) => {
            const active = pathname === item.href;
            const tint = active ? colors.accent : colors.muted;
            return (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => go(item.href)}
                style={({ pressed }) => [
                  styles.row,
                  active ? styles.rowActive : null,
                  pressed ? styles.rowPressed : null,
                ]}
              >
                <View style={[styles.iconTile, active ? styles.iconTileActive : null]}>
                  <LineIcon name={item.icon} size={19} color={tint} />
                </View>
                <AppText size="md" weight={active ? "bold" : "medium"} style={{ color: active ? colors.accent : colors.text }}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(24, 18, 77, 0.45)" },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
    shadowColor: "#18124d",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.md },
  logoTile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.navyDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.accentSoft },
  rowPressed: { backgroundColor: colors.lineSoft },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconTileActive: { backgroundColor: colors.surface },
});
