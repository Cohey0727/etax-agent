import { MiscIncomeInput } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Card, SwitchRow } from "@/components";
import { space } from "@/theme";
import { AmountField, SectionHead } from "../fields";

export interface MiscIncomePanelProps {
  miscIncome: MiscIncomeInput;
  onChange: (next: MiscIncomeInput) => void;
}

/**
 * 雑所得の入力。帳簿は事業・不動産しか持たないため、帳簿に載らない所得は
 * ここで入れる。第一表の「雑」欄（公的年金等・業務・その他）に対応し、
 * 合計所得と税額計算に含まれる。公的年金等の所得金額は、収入金額と
 * 65歳以上かどうかから公的年金等控除を引いて自動計算する。業務・その他は
 * 所得金額（必要経費を引いた後の金額）を入力する。
 */
export function MiscIncomePanel({ miscIncome, onChange }: MiscIncomePanelProps) {
  const set = (patch: Partial<MiscIncomeInput>) => onChange({ ...miscIncome, ...patch });

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="雑所得"
          description="帳簿（事業・不動産）に載らない雑所得を、公的年金等・業務・その他の区分ごとに入力します。"
        />
        <SectionHead title="公的年金等" />
        <AmountField
          label="公的年金等の収入金額"
          value={miscIncome.pensionRevenue}
          onChange={(v) => set({ pensionRevenue: v })}
        />
        <SwitchRow
          label="65歳以上"
          description="その年の12月31日時点で65歳以上（所得金額は公的年金等控除を引いて自動計算）"
          value={miscIncome.pensionOver65}
          onChange={(v) => set({ pensionOver65: v })}
        />
        <SectionHead
          title="業務"
          description="副業など、営利を目的とした継続的な業務に係る雑所得です。"
        />
        <AmountField
          label="業務の収入金額"
          value={miscIncome.businessRevenue}
          onChange={(v) => set({ businessRevenue: v })}
        />
        <AmountField
          label="業務の所得金額（必要経費を引いた後）"
          value={miscIncome.businessIncome}
          onChange={(v) => set({ businessIncome: v })}
        />
        <AmountField
          label="業務区分（申告書「キ」の区分番号。現金主義の特例は 1、なければ 0）"
          value={miscIncome.businessKubun}
          onChange={(v) => set({ businessKubun: v })}
        />
        <SectionHead
          title="その他"
          description="仮想通貨の売却益など、上記以外の雑所得です。"
        />
        <AmountField
          label="その他の収入金額"
          value={miscIncome.revenue}
          onChange={(v) => set({ revenue: v })}
        />
        <AmountField
          label="その他の所得金額（必要経費を引いた後）"
          value={miscIncome.income}
          onChange={(v) => set({ income: v })}
        />
        <AmountField
          label="その他区分（申告書「ク」の区分番号。なければ 0）"
          value={miscIncome.kubun}
          onChange={(v) => set({ kubun: v })}
        />
        <AppText size="xs" tone="muted">
          区分番号は金額欄ではなく区分欄に入る番号です。
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
