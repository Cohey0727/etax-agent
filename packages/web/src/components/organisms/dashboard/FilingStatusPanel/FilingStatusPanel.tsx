import { filterYear, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { AppView, FilingStatus } from "@types";
import { fetchFilingStatuses } from "@utils/api";
import styles from "./FilingStatusPanel.css";

type ManualStepKey = "confirmed" | "calculated" | "submitted";

interface ManualStep {
  key: ManualStepKey;
  label: string;
}

const MANUAL_STEPS: readonly ManualStep[] = [
  { key: "confirmed", label: "確認" },
  { key: "calculated", label: "控除・計算" },
  { key: "submitted", label: "提出" },
];

export interface FilingStatusPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 確定申告画面へのリンク用。ステータスの変更はそちらで行う。 */
  onNavigate?: (view: AppView) => void;
}

/**
 * 申告ステータス（帳簿 → 確認 → 控除・計算 → 提出）の進捗表示（表示専用）。
 * ステータスの変更は確定申告画面で行い、ここからはリンクで遷移するだけ。
 * DB未接続の環境では何も表示しない。
 */
export const FilingStatusPanel = ({ transactions, year, onNavigate }: FilingStatusPanelProps) => {
  const [statuses, setStatuses] = useState<FilingStatus[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingStatuses().then((result) => {
      if (!cancelled) setStatuses(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const status = statuses?.find((s) => s.year === year) ?? EMPTY_STATUS;

  if (statuses === null) return null;

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">申告ステータス — {year}年分</Text>
          <Text variant="muted">
            帳簿 → 確認 → 控除・計算 → 提出 の順に進めます。ステータスの変更は確定申告画面で行います。
            提出は e-Tax で行い、ここは進捗の表示用です。
          </Text>
        </Col>

        <Row align="center" gap="sm">
          <span className={yearTransactions.length > 0 ? `${styles.dot} ${styles.dotDone}` : styles.dot}>
            ✓
          </span>
          <Text className={styles.stepLabel}>帳簿</Text>
          <Text variant="muted">
            取引 {yearTransactions.length} 件
            {unclassifiedCount > 0 ? ` ・ 未分類 ${unclassifiedCount} 件` : ""}
          </Text>
        </Row>

        {MANUAL_STEPS.map((step) => {
          const done = status[step.key];
          const doneAt = status[`${step.key}_at`];
          return (
            <Row key={step.key} align="center" gap="sm">
              <span className={done ? `${styles.dot} ${styles.dotDone}` : styles.dot}>✓</span>
              <Text className={styles.stepLabel}>{step.label}</Text>
              <Text variant="muted">{done && doneAt ? `${formatDate(doneAt)} 済み` : "未"}</Text>
            </Row>
          );
        })}

        {onNavigate ? (
          <Row>
            <Button variant="ghost" size="sm" onClick={() => onNavigate(AppView.Filing)}>
              確定申告画面で進める →
            </Button>
          </Row>
        ) : null}
      </Col>
    </Card>
  );
};

const EMPTY_STATUS: FilingStatus = {
  year: 0,
  confirmed: false,
  confirmed_at: null,
  calculated: false,
  calculated_at: null,
  submitted: false,
  submitted_at: null,
};

function formatDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "/");
}
