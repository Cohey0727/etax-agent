import { outputTaxFromTaxInclusive } from "@etax/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { LabeledValue } from "@/components/LabeledValue";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenContainer } from "@/components/ScreenContainer";
import { API_URL } from "@/config";

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e3e1f2",
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  cardTitle: {
    color: "#26224d",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  description: {
    color: "#6f6c8f",
    fontSize: 13,
    lineHeight: 19,
  },
  heading: {
    color: "#26224d",
    fontSize: 22,
    fontWeight: "800",
  },
  input: {
    borderColor: "#e3e1f2",
    borderRadius: 12,
    borderWidth: 1,
    color: "#26224d",
    fontSize: 17,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});

/** 税込金額の入力欄から数値だけを取り出す。不正な入力は 0 として扱う。 */
function parseAmount(input: string): number {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  return Number(digits);
}

function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")} 円`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [amountInput, setAmountInput] = useState("1100000");

  const amount: number = parseAmount(amountInput);
  const outputTax: number = outputTaxFromTaxInclusive(amount);
  const netAmount: number = amount - outputTax;

  return (
    <ScreenContainer>
      <Text style={styles.heading}>ホーム</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>消費税額の計算（計算コア連携）</Text>
        <TextInput
          accessibilityLabel="税込売上"
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={setAmountInput}
          style={styles.input}
          value={amountInput}
        />
        <LabeledValue label="税込売上" value={formatYen(amount)} />
        <LabeledValue label="消費税額（10%）" value={formatYen(outputTax)} />
        <LabeledValue label="税抜売上" value={formatYen(netAmount)} />
        <Text style={styles.description}>
          計算は @etax/shared の計算コアで行っています。Web・サーバーと同一の実装です。
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>接続先</Text>
        <LabeledValue label="API" value={API_URL} />
      </View>
      <PrimaryButton label="ログイン画面へ" onPress={() => router.push("/login")} />
    </ScreenContainer>
  );
}
