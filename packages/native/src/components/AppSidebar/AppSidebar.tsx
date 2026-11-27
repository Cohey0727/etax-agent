import { Href, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/state/AppContext";
import { useSidebar } from "@/state/SidebarContext";
import { colors, radius, space } from "@/theme";
import { AppText } from "../AppText";
import { LineIcon, LineIconName } from "../LineIcon";
import { SelectField } from "../SelectField";
import { SorobanMark } from "../SorobanMark";

interface SidebarItem {
  href: Href;
  label: string;
  icon: LineIconName;
}

const ITEMS: readonly SidebarItem[] = [
  { href: "/", label: "ダッシュボード", icon: "grid" },
  { href: "/ledger", label: "帳簿", icon: "book" },
  { href: "/reports", label: "試算表", icon: "bill" },
  { href: "/cashflow", label: "資金繰り", icon: "chart" },
  { href: "/assets", label: "固定資産", icon: "building" },
  { href: "/invoices", label: "請求書", icon: "receipt" },
  { href: "/taxpayer", label: "納税者情報", icon: "user" },
  { href: "/filing", label: "確定申告", icon: "fileCheck" },
  { href: "/mcp-settings", label: "MCP設定", icon: "settings" },
  { href: "/settings", label: "設定", icon: "settings" },
];

// 確定申告にぶら下がる子項目（タブへの直接遷移）。総合は親そのものなので出さない。
const FILING_CHILDREN: readonly { key: string; label: string }[] = [
  { key: "balance", label: "収支" },
  { key: "deductions", label: "控除" },
  { key: "consumption", label: "消費税" },
];

const PANEL_WIDTH = 284;

/** 左からスライドインするサイドバーメニュー。 */
export function AppSidebar() {
  const { sidebarOpen, closeSidebar } = useSidebar();
  const { year, years, setYear, transactions } = useAppState();
  const router = useRouter();
  const pathname = usePathname();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
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

  const goFiling = (tab: string) => {
    closeSidebar();
    router.navigate({ pathname: "/filing", params: { tab } });
  };

  // 年度の追加はセレクタの中の選択肢で行う（最大年度+1 / 最小年度-1）。
  const nextYear = (years[0] ?? new Date().getFullYear()) + 1;
  const prevYear = years.length > 0 ? years[years.length - 1] - 1 : null;
  const yearOptions = [
    { value: `add:${nextYear}`, label: `${nextYear}年度を追加` },
    ...years.map((y) => ({ value: String(y), label: `${y}年度` })),
    ...(prevYear !== null ? [{ value: `add:${prevYear}`, label: `${prevYear}年度を追加` }] : []),
  ];
  const handleYearSelect = (raw: string) => {
    setYear(Number(raw.startsWith("add:") ? raw.slice("add:".length) : raw));
  };

  const filingTab = pathname === "/filing" ? (tabParam ?? "overview") : null;

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
          <View>
            <AppText size="lg" weight="bold">
              eTaxAgent
            </AppText>
            <AppText size="xs" tone="muted">
              確定申告 準備ツール
            </AppText>
          </View>
        </View>
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.list}>
          {ITEMS.map((item) => {
            const active = pathname === item.href;
            const tint = active ? colors.accent : colors.muted;
            return (
              <Fragment key={item.label}>
                {item.href === "/filing" ? (
                  <View style={styles.yearBlock}>
                    <SelectField
                      label="年度"
                      value={String(year)}
                      options={yearOptions}
                      onChange={handleYearSelect}
                    />
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() =>
                    item.href === "/filing" ? goFiling("overview") : go(item.href)
                  }
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
                {item.href === "/filing"
                  ? FILING_CHILDREN.map((child) => {
                      const childActive = filingTab === child.key;
                      return (
                        <Pressable
                          key={child.key}
                          accessibilityRole="button"
                          accessibilityLabel={child.label}
                          onPress={() => goFiling(child.key)}
                          style={({ pressed }) => [
                            styles.childRow,
                            childActive ? styles.rowActive : null,
                            pressed ? styles.rowPressed : null,
                          ]}
                        >
                          <AppText
                            size="sm"
                            weight={childActive ? "bold" : "medium"}
                            style={{ color: childActive ? colors.accent : colors.text }}
                          >
                            {child.label}
                          </AppText>
                        </Pressable>
                      );
                    })
                  : null}
              </Fragment>
            );
          })}
        </ScrollView>
        <View style={styles.dataPanel}>
          <AppText size="xs" weight="semibold" tone="subtle">
            表示中のデータ
          </AppText>
          <AppText size="sm">帳簿（{transactions.length}件）</AppText>
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
  listScroll: { flex: 1 },
  list: { gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  childRow: {
    paddingVertical: space.sm,
    paddingLeft: 58,
    paddingRight: space.sm,
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
  yearBlock: { paddingHorizontal: space.sm, paddingVertical: space.sm },
  dataPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    gap: 2,
  },
});
