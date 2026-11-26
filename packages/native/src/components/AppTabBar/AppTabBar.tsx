import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { BouncePressable } from "@/components/BouncePressable";
import { LineIcon, LineIconName } from "@/components/LineIcon";
import { cardShadow, colors, space } from "@/theme";

/** タブバーの props。遷移そのものは呼び出し側（_layout）が担い、ここは表示と選択だけを行う。 */
export interface AppTabBarProps {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  onNavigate: (name: string) => void;
}

interface TabDef {
  name: string;
  label: string;
  icon: LineIconName;
  center?: boolean;
}

// 下部タブは5つ。中央はチャット（AIエージェント）を主役として大きく出す。
const TAB_DEFS: readonly TabDef[] = [
  { name: "ledger", label: "帳簿", icon: "book" },
  { name: "filing", label: "確定申告", icon: "fileCheck" },
  { name: "agent", label: "チャット", icon: "agent", center: true },
  { name: "more", label: "その他", icon: "grid" },
  { name: "settings", label: "設定", icon: "settings" },
];

// タブに無い画面のうち、「その他」にぶら下がる画面（滞在中は「その他」を選択表示にする）。
const MORE_ROUTES: ReadonlySet<string> = new Set([
  "index",
  "reports",
  "cashflow",
  "assets",
  "invoices",
  "taxpayer",
  "mcp-settings",
  "import",
  "receipt",
]);

// タブバーを出さない画面。
const BAR_HIDDEN_ROUTES: ReadonlySet<string> = new Set(["login", "auth-callback"]);

/** 画面下部に常駐するタブバー。 */
export function AppTabBar({ state, onNavigate }: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const currentName = state.routes[state.index]?.name ?? "";
  if (BAR_HIDDEN_ROUTES.has(currentName)) return null;

  const activeName = TAB_DEFS.some((def) => def.name === currentName)
    ? currentName
    : MORE_ROUTES.has(currentName)
      ? "more"
      : "";

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {TAB_DEFS.map((def) => {
        const active = def.name === activeName;
        const tint = active ? colors.accent : colors.muted;
        if (def.center) {
          return (
            <BouncePressable
              key={def.name}
              accessibilityRole="button"
              accessibilityLabel={def.label}
              onPress={() => onNavigate(def.name)}
              style={styles.slot}
              pressScale={0.92}
            >
              <LinearGradient
                colors={[colors.navy, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.centerButton}
              >
                <LineIcon name={def.icon} size={25} color={colors.onAccent} />
              </LinearGradient>
              <AppText size="xs" weight={active ? "bold" : "medium"} style={{ color: tint }}>
                {def.label}
              </AppText>
            </BouncePressable>
          );
        }
        return (
          <BouncePressable
            key={def.name}
            accessibilityRole="button"
            accessibilityLabel={def.label}
            onPress={() => onNavigate(def.name)}
            style={styles.slot}
            pressScale={0.92}
          >
            <LineIcon name={def.icon} size={23} color={tint} />
            <AppText size="xs" weight={active ? "bold" : "medium"} style={{ color: tint }}>
              {def.label}
            </AppText>
          </BouncePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    minHeight: 52,
  },
  centerButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    ...cardShadow,
  },
});
