import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { SorobanMark } from "@/components/SorobanMark";
import { colors, radius, space } from "@/theme";

/** 濃紺グラデーションのブランドヘッダー（Web の LoginBrandPanel 相当）。 */
export function LoginBrandHeader() {
  return (
    <LinearGradient
      colors={[colors.navy, colors.navyDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.panel}
    >
      <View style={styles.row}>
        <SorobanMark width={56} />
        <View style={styles.texts}>
          <AppText size="xxl" weight="bold" tone="onNavy">
            eTaxAgent
          </AppText>
          <AppText size="md" tone="onNavySubtle">
            AIが、すべてやります。
          </AppText>
        </View>
      </View>
      <AppText size="sm" tone="onNavySubtle">
        帳簿づけから確定申告の準備まで、AIエージェントが代行します。申告の最終提出は納税者本人が行います。
      </AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  texts: { flex: 1, gap: 2 },
});
