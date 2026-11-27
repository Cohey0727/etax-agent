import {
  BALANCE_SHEET_ACCOUNT_LABELS,
  BS_ASSET_ACCOUNTS,
  BS_LIABILITY_ACCOUNTS,
  BalanceSheetAccount,
  BalanceSheetWireExtra,
  FilingType,
  XtxBalanceSheetInput,
  buildTrialBalanceSheet,
  carryOverBalanceSheet,
  emptyBalanceSheetInput,
  isBalanceSheetEmpty,
  parseDeductionState,
} from "@etax/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton, AppText, Card } from "@/components";
import { fetchFilingInputs } from "@/api";
import { space } from "@/theme";
import { formatYen } from "@/utils";
import { ResultRow, SectionHead, SignedMoneyInput } from "../fields";
import { AccountRow, ClosingOnlyRow, ExtraRow } from "./BalanceSheetRows";

type ExtraField = "extraAsset" | "extraLiability1" | "extraLiability2";

const EMPTY_EXTRA: BalanceSheetWireExtra = { name: "", opening: 0, closing: 0 };

export interface BalanceSheetPanelProps {
  year: number;
  /** 貸借対照表の入力（未入力は null）。保存は申告入力として年度別に行われる。 */
  balanceSheet: XtxBalanceSheetInput | null;
  /** 青色申告特別控除前の事業所得（期末の貸借チェックに使う） */
  incomeBeforeBlue: number;
  /** 前年の青色申告特別控除前の事業所得（繰越の元入金計算に使う） */
  previousIncomeBeforeBlue: number;
  filingType: FilingType;
  onChange: (next: XtxBalanceSheetInput | null) => void;
}

/**
 * 貸借対照表（青色申告決算書4面）の入力。期首（1月1日）・期末（12月31日）の
 * 残高を入れると、試算表とXTX出力（KOA210-4）に反映される。
 * 前年の保存値があれば、期末残高を期首へ取り込む繰越もできる。
 * 貸借が一致しなくても保存はでき、警告だけを出す（XTX出力時は
 * サーバー側で不整合としてエラーになる）。
 */
export function BalanceSheetPanel({
  year,
  balanceSheet,
  incomeBeforeBlue,
  previousIncomeBeforeBlue,
  filingType,
  onChange,
}: BalanceSheetPanelProps) {
  const [previous, setPrevious] = useState<XtxBalanceSheetInput | null>(null);

  // 前年の貸借対照表（繰越の提案用）。サーバーの申告入力から読む。
  useEffect(() => {
    let cancelled = false;
    setPrevious(null);
    void fetchFilingInputs(year - 1).then((res) => {
      if (cancelled || !res) return;
      const prev = parseDeductionState(res.state as Parameters<typeof parseDeductionState>[0])
        .balanceSheet;
      if (prev && !isBalanceSheetEmpty(prev)) setPrevious(prev);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const carryOver = () => {
    if (previous) onChange(carryOverBalanceSheet(previous, balanceSheet, previousIncomeBeforeBlue));
  };

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="貸借対照表"
          description="青色申告決算書（4面）の貸借対照表です。期首・期末の残高を入力すると、試算表とXTX出力に反映されます。貸借が一致しなくても保存はできます。"
        />
        {filingType === "white" ? (
          <AppText size="sm" tone="muted">
            白色申告（収支内訳書）では貸借対照表は提出しません。青色申告で
            65万円・55万円控除を受ける場合に入力してください。
          </AppText>
        ) : null}
        {balanceSheet === null ? (
          <>
            <AppText size="sm" tone="muted">
              まだ入力がありません。
            </AppText>
            <View style={styles.actions}>
              <AppButton
                label="入力をはじめる"
                onPress={() => onChange(emptyBalanceSheetInput())}
              />
              {previous ? (
                <AppButton
                  label={`${year - 1}年の期末残高を取り込んで始める`}
                  variant="ghost"
                  onPress={carryOver}
                />
              ) : null}
            </View>
          </>
        ) : (
          <BalanceSheetEditor
            year={year}
            bs={balanceSheet}
            incomeBeforeBlue={incomeBeforeBlue}
            hasPrevious={previous !== null}
            onCarryOver={carryOver}
            onChange={onChange}
          />
        )}
      </View>
    </Card>
  );
}

interface BalanceSheetEditorProps {
  year: number;
  bs: XtxBalanceSheetInput;
  incomeBeforeBlue: number;
  hasPrevious: boolean;
  onCarryOver: () => void;
  onChange: (next: XtxBalanceSheetInput | null) => void;
}

function BalanceSheetEditor({
  year,
  bs,
  incomeBeforeBlue,
  hasPrevious,
  onCarryOver,
  onChange,
}: BalanceSheetEditorProps) {
  const sheet = buildTrialBalanceSheet(bs, incomeBeforeBlue);
  const nonEmpty = !isBalanceSheetEmpty(bs);
  const setAccount = (side: "opening" | "closing", key: BalanceSheetAccount, value: number) =>
    onChange({ ...bs, [side]: { ...bs[side], [key]: value } });
  const setExtra = (field: ExtraField, next: BalanceSheetWireExtra) =>
    onChange({ ...bs, [field]: next });

  return (
    <View style={styles.wrap}>
      <SectionHead title="資産の部" />
      {BS_ASSET_ACCOUNTS.map(([key]) => (
        <AccountRow
          key={key}
          label={BALANCE_SHEET_ACCOUNT_LABELS[key]}
          opening={bs.opening[key] ?? 0}
          closing={bs.closing[key] ?? 0}
          onOpening={(v) => setAccount("opening", key, v)}
          onClosing={(v) => setAccount("closing", key, v)}
        />
      ))}
      <ExtraRow
        nameLabel="その他の資産"
        value={bs.extraAsset ?? EMPTY_EXTRA}
        onChange={(next) => setExtra("extraAsset", next)}
      />
      <ClosingOnlyRow
        label="事業主貸"
        closing={bs.ownerLoan}
        onClosing={(v) => onChange({ ...bs, ownerLoan: v })}
      />
      <ResultRow label="資産合計（期首）" value={sheet.opening_assets} />
      <ResultRow label="資産合計（期末）" value={sheet.closing_assets} strong />

      <SectionHead title="負債・資本の部" />
      {BS_LIABILITY_ACCOUNTS.map(([key]) => (
        <AccountRow
          key={key}
          label={BALANCE_SHEET_ACCOUNT_LABELS[key]}
          opening={bs.opening[key] ?? 0}
          closing={bs.closing[key] ?? 0}
          onOpening={(v) => setAccount("opening", key, v)}
          onClosing={(v) => setAccount("closing", key, v)}
        />
      ))}
      <AccountRow
        label={BALANCE_SHEET_ACCOUNT_LABELS.allowance_for_doubtful_accounts}
        opening={bs.opening.allowance_for_doubtful_accounts ?? 0}
        closing={bs.closing.allowance_for_doubtful_accounts ?? 0}
        onOpening={(v) => setAccount("opening", "allowance_for_doubtful_accounts", v)}
        onClosing={(v) => setAccount("closing", "allowance_for_doubtful_accounts", v)}
      />
      <ExtraRow
        nameLabel="その他の負債（1）"
        value={bs.extraLiability1 ?? EMPTY_EXTRA}
        onChange={(next) => setExtra("extraLiability1", next)}
      />
      <ExtraRow
        nameLabel="その他の負債（2）"
        value={bs.extraLiability2 ?? EMPTY_EXTRA}
        onChange={(next) => setExtra("extraLiability2", next)}
      />
      <ClosingOnlyRow
        label="事業主借"
        closing={bs.ownerBorrowing}
        onClosing={(v) => onChange({ ...bs, ownerBorrowing: v })}
      />
      <View style={styles.accountRow}>
        <AppText size="sm" weight="semibold" tone="subtle">
          元入金
        </AppText>
        <View style={styles.amountPair}>
          <View style={styles.amountCell}>
            <AppText size="xs" tone="muted">
              期首（1月1日）
            </AppText>
            <SignedMoneyInput
              accessibilityLabel="元入金（期首）"
              value={bs.opening.capital ?? 0}
              onChange={(v) => setAccount("opening", "capital", v)}
            />
          </View>
          <View style={styles.amountCell}>
            <AppText size="xs" tone="muted">
              期末（12月31日）
            </AppText>
            <AppText size="md" weight="medium" style={styles.readonlyAmount}>
              {formatYen(sheet.capital)}
            </AppText>
          </View>
        </View>
      </View>
      <ResultRow label="所得金額（青色申告特別控除前）" value={sheet.income_before_blue} />
      <ResultRow label="負債・資本合計（期首）" value={sheet.opening_liabilities_capital} />
      <ResultRow
        label="負債・資本合計（期末）"
        value={sheet.closing_liabilities_capital}
        strong
      />
      <AppText size="xs" tone="muted">
        元入金の期末欄には、様式の取扱いにより期首元入金と同額が記載されます。
        所得金額は帳簿（事業所得）から自動で入ります。
      </AppText>

      {nonEmpty && (!sheet.opening_balanced || !sheet.closing_balanced) ? (
        <AlertBox
          tone="warn"
          message={[
            !sheet.opening_balanced
              ? `期首の貸借が一致していません（差額 ${formatYen(sheet.opening_assets - sheet.opening_liabilities_capital)}）。`
              : null,
            !sheet.closing_balanced
              ? `期末の貸借が一致していません（差額 ${formatYen(sheet.closing_assets - sheet.closing_liabilities_capital)}）。`
              : null,
            "このまま保存はできますが、XTX出力ではエラーになります。",
          ]
            .filter((part) => part !== null)
            .join(" ")}
        />
      ) : null}
      {nonEmpty && sheet.opening_balanced && sheet.closing_balanced ? (
        <AppText size="xs" tone="muted">
          期首・期末とも貸借が一致しています。
        </AppText>
      ) : null}

      <View style={styles.actions}>
        {hasPrevious ? (
          <AppButton
            label={`${year - 1}年の期末残高を期首に取り込む`}
            variant="ghost"
            onPress={onCarryOver}
          />
        ) : null}
        <AppButton label="入力をクリア" variant="ghost" onPress={() => onChange(null)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  actions: { gap: space.sm },
  accountRow: { gap: 4 },
  amountPair: { flexDirection: "row", gap: space.sm },
  amountCell: { flex: 1, gap: 2 },
  readonlyAmount: { textAlign: "right", paddingVertical: 10, paddingHorizontal: 10 },
});
