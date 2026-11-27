import {
  BALANCE_SHEET_ACCOUNT_LABELS,
  BS_ASSET_ACCOUNTS,
  BS_LIABILITY_ACCOUNTS,
  BalanceSheetAccount,
  BalanceSheetWireExtra,
  DeductionState,
  FilingType,
  XtxBalanceSheetInput,
  buildTrialBalanceSheet,
  carryOverBalanceSheet,
  emptyBalanceSheetInput,
  isBalanceSheetEmpty,
  parseDeductionState,
} from "@etax/shared";
import { useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { fetchFilingInputs, formatYen } from "@utils";
import { AmountRow, ExtraRow, TotalRow, toAmount } from "./BalanceSheetRows";
import styles from "./BalanceSheetPanel.css";

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
export const BalanceSheetPanel = ({
  year,
  balanceSheet,
  incomeBeforeBlue,
  previousIncomeBeforeBlue,
  filingType,
  onChange,
}: BalanceSheetPanelProps) => {
  const [previous, setPrevious] = useState<XtxBalanceSheetInput | null>(null);

  // 前年の貸借対照表（繰越の提案用）。サーバーの申告入力から読む。
  useEffect(() => {
    let cancelled = false;
    setPrevious(null);
    void fetchFilingInputs(year - 1).then((res) => {
      if (cancelled || !res) return;
      const prev = parseDeductionState(res.state as Partial<DeductionState>).balanceSheet;
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
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">貸借対照表</Text>
          <Text variant="muted">
            青色申告決算書（4面）の貸借対照表です。期首・期末の残高を入力すると、
            試算表とXTX出力に反映されます。貸借が一致しなくても保存はできます。
          </Text>
          {filingType === "white" ? (
            <Text variant="muted">
              白色申告（収支内訳書）では貸借対照表は提出しません。青色申告で
              65万円・55万円控除を受ける場合に入力してください。
            </Text>
          ) : null}
        </Col>
        {balanceSheet === null ? (
          <>
            <Text variant="muted">まだ入力がありません。</Text>
            <Row gap="sm">
              <Button variant="primary" onClick={() => onChange(emptyBalanceSheetInput())}>
                入力をはじめる
              </Button>
              {previous ? (
                <Button onClick={carryOver}>
                  {year - 1}年の期末残高を取り込んで始める
                </Button>
              ) : null}
            </Row>
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
      </Col>
    </Card>
  );
};

interface BalanceSheetEditorProps {
  year: number;
  bs: XtxBalanceSheetInput;
  incomeBeforeBlue: number;
  hasPrevious: boolean;
  onCarryOver: () => void;
  onChange: (next: XtxBalanceSheetInput | null) => void;
}

const BalanceSheetEditor = ({
  year,
  bs,
  incomeBeforeBlue,
  hasPrevious,
  onCarryOver,
  onChange,
}: BalanceSheetEditorProps) => {
  const sheet = buildTrialBalanceSheet(bs, incomeBeforeBlue);
  const nonEmpty = !isBalanceSheetEmpty(bs);
  const setAccount = (side: "opening" | "closing", key: BalanceSheetAccount, value: number) =>
    onChange({ ...bs, [side]: { ...bs[side], [key]: value } });
  const setExtra = (field: ExtraField, next: BalanceSheetWireExtra) =>
    onChange({ ...bs, [field]: next });
  const accountRow = (key: BalanceSheetAccount) => (
    <AmountRow
      key={key}
      label={BALANCE_SHEET_ACCOUNT_LABELS[key]}
      opening={bs.opening[key] ?? 0}
      closing={bs.closing[key] ?? 0}
      onOpening={(v) => setAccount("opening", key, v)}
      onClosing={(v) => setAccount("closing", key, v)}
    />
  );
  const extraRow = (field: ExtraField, nameLabel: string) => (
    <ExtraRow
      key={field}
      nameLabel={nameLabel}
      value={bs[field] ?? EMPTY_EXTRA}
      onChange={(next) => setExtra(field, next)}
    />
  );

  return (
    <Col gap="sm">
      <div className={`${styles.row} ${styles.headRow}`}>
        <span>科目</span>
        <span className={styles.cell}>期首（1月1日）</span>
        <span className={styles.cell}>期末（12月31日）</span>
      </div>

      <Text className={styles.subhead}>資産の部</Text>
      {BS_ASSET_ACCOUNTS.map(([key]) => accountRow(key))}
      {extraRow("extraAsset", "その他の資産")}
      <AmountRow
        label="事業主貸"
        opening={null}
        closing={bs.ownerLoan}
        onClosing={(v) => onChange({ ...bs, ownerLoan: v })}
      />
      <TotalRow label="資産合計" opening={sheet.opening_assets} closing={sheet.closing_assets} />

      <Text className={styles.subhead}>負債・資本の部</Text>
      {BS_LIABILITY_ACCOUNTS.map(([key]) => accountRow(key))}
      {accountRow("allowance_for_doubtful_accounts")}
      {extraRow("extraLiability1", "その他の負債（1）")}
      {extraRow("extraLiability2", "その他の負債（2）")}
      <AmountRow
        label="事業主借"
        opening={null}
        closing={bs.ownerBorrowing}
        onClosing={(v) => onChange({ ...bs, ownerBorrowing: v })}
      />
      <div className={styles.row}>
        <Text variant="muted">元入金</Text>
        <Input
          className={styles.amountInput}
          type="number"
          value={bs.opening.capital ?? 0}
          onChange={(e) => setAccount("opening", "capital", toAmount(e.target.value))}
          aria-label="元入金（期首）"
        />
        <span className={styles.cell}>{formatYen(sheet.capital)}</span>
      </div>
      <div className={styles.row}>
        <Text variant="muted">所得金額（青色申告特別控除前）</Text>
        <span className={styles.cell}>―</span>
        <span className={styles.cell}>{formatYen(sheet.income_before_blue)}</span>
      </div>
      <TotalRow
        label="負債・資本合計"
        opening={sheet.opening_liabilities_capital}
        closing={sheet.closing_liabilities_capital}
      />
      <Text variant="caption">
        元入金の期末欄には、様式の取扱いにより期首元入金と同額が記載されます。
        所得金額は帳簿（事業所得）から自動で入ります。
      </Text>

      {nonEmpty && (!sheet.opening_balanced || !sheet.closing_balanced) ? (
        <AlertBox variant="notice">
          <Col gap="sm">
            {sheet.opening_balanced ? null : (
              <Text>
                期首の貸借が一致していません（差額{" "}
                {formatYen(sheet.opening_assets - sheet.opening_liabilities_capital)}円）。
              </Text>
            )}
            {sheet.closing_balanced ? null : (
              <Text>
                期末の貸借が一致していません（差額{" "}
                {formatYen(sheet.closing_assets - sheet.closing_liabilities_capital)}円）。
              </Text>
            )}
            <Text>このまま保存はできますが、XTX出力ではエラーになります。</Text>
          </Col>
        </AlertBox>
      ) : null}
      {nonEmpty && sheet.opening_balanced && sheet.closing_balanced ? (
        <Text variant="caption">期首・期末とも貸借が一致しています。</Text>
      ) : null}

      <Row gap="sm">
        {hasPrevious ? (
          <Button onClick={onCarryOver}>{year - 1}年の期末残高を期首に取り込む</Button>
        ) : null}
        <Button variant="ghost" onClick={() => onChange(null)}>
          入力をクリア
        </Button>
      </Row>
    </Col>
  );
};
