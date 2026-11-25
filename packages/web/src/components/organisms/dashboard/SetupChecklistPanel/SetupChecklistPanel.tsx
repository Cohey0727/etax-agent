import { filterYear, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Text } from "@components/atoms";
import { AppView } from "@types";
import { fetchFilingInputs, fetchTaxpayerProfile } from "@utils/api";
import styles from "./SetupChecklistPanel.css";

export interface SetupChecklistPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  onNavigate?: (view: AppView) => void;
}

interface SetupItem {
  label: string;
  done: boolean;
  detail: string;
  view: AppView;
  action: string;
}

/**
 * 初期設定チェックリスト（オンボーディング）。
 * 納税者情報・申告入力・帳簿データの3項目はそれぞれ独立しており、
 * 順序を強制するステッパーにはしない（各項目から直接その画面へ移動できる）。
 * 全部そろったら表示しない。
 */
export const SetupChecklistPanel = ({ transactions, year, onNavigate }: SetupChecklistPanelProps) => {
  const [profileDone, setProfileDone] = useState<boolean | null>(null);
  const [inputsDone, setInputsDone] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTaxpayerProfile(year).then((result) => {
      if (!cancelled) setProfileDone(Boolean(result?.taxpayer.name));
    });
    void fetchFilingInputs(year).then((result) => {
      if (!cancelled) setInputsDone(result !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);

  if (profileDone === null || inputsDone === null) return null;

  const items: SetupItem[] = [
    {
      label: "納税者情報",
      done: profileDone,
      detail: profileDone ? "氏名などが登録されています" : "氏名・住所・マイナンバーなどを登録します",
      view: AppView.Taxpayer,
      action: "納税者情報を開く →",
    },
    {
      label: "帳簿データ",
      done: yearTransactions.length > 0,
      detail:
        yearTransactions.length > 0
          ? `${year}年分の取引 ${yearTransactions.length} 件`
          : "銀行・カードのCSVを取り込みます",
      view: AppView.Import,
      action: "CSV取込を開く →",
    },
    {
      label: "申告の種類と控除",
      done: inputsDone,
      detail: inputsDone
        ? "申告入力が保存されています"
        : "青色/白色の選択と、控除・雑所得の入力をします",
      view: AppView.Filing,
      action: "確定申告画面を開く →",
    },
  ];

  if (items.every((item) => item.done)) return null;

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">初期設定 — {year}年分</Text>
          <Text variant="muted">
            申告に必要な設定の一覧です。各項目は独立しているので、どれからでも始められます。
          </Text>
        </Col>
        <Col gap="md">
          {items.map((item) => (
            <div key={item.label} className={styles.row}>
              <Text className={styles.itemLabel}>
                {item.label}
                <Badge tone={item.done ? "accent" : "muted"}>{item.done ? "設定済み" : "未設定"}</Badge>
              </Text>
              <Text variant="muted" className={styles.detail}>{item.detail}</Text>
              {!item.done && onNavigate ? (
                <Button variant="ghost" size="sm" onClick={() => onNavigate(item.view)}>
                  {item.action}
                </Button>
              ) : null}
            </div>
          ))}
        </Col>
      </Col>
    </Card>
  );
};
