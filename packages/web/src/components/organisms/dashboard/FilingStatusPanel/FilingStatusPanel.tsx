import { filterYear, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { FilingStatus } from "@types";
import { fetchFilingStatuses, updateFilingStatus } from "@utils/api";
import styles from "./FilingStatusPanel.css";

type ManualStepKey = "confirmed" | "calculated" | "submitted";

interface ManualStep {
  key: ManualStepKey;
  label: string;
  doneAction: string;
}

const MANUAL_STEPS: readonly ManualStep[] = [
  { key: "confirmed", label: "確認", doneAction: "確認済みにする" },
  { key: "calculated", label: "控除・計算", doneAction: "計算済みにする" },
  { key: "submitted", label: "提出", doneAction: "提出済みにする" },
];

export interface FilingStatusPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

/**
 * 申告ステータス（帳簿 → 確認 → 控除・計算 → 提出）の進捗表示。
 * 帳簿は取引データから自動判定し、残り3ステップは手動で済みにする。
 * 状態はサーバー（DB）に保存される。DB未接続の環境では何も表示しない。
 */
export const FilingStatusPanel = ({ transactions, year }: FilingStatusPanelProps) => {
  const [statuses, setStatuses] = useState<FilingStatus[] | null>(null);
  const [saving, setSaving] = useState(false);

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

  const toggleStep = async (key: ManualStepKey, done: boolean) => {
    const patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean } = {};
    patch[key] = !done;
    setSaving(true);
    const updated = await updateFilingStatus(year, patch);
    setSaving(false);
    if (!updated) return;
    setStatuses((prev) =>
      prev === null
        ? prev
        : [...prev.filter((s) => s.year !== year), updated].sort((a, b) => a.year - b.year),
    );
  };

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">申告ステータス — {year}年分</Text>
          <Text variant="muted">
            帳簿 → 確認 → 控除・計算 → 提出 の順に進めます。帳簿は取引データから自動判定し、
            残りのステップは済んだらボタンを押してください。状態はサーバーに保存されます。
            提出は e-Tax で行い、ここは進捗の記録用です。
          </Text>
        </Col>

        <Row align="center" justify="spaceBetween">
          <Row align="center" gap="sm" className={styles.grow}>
            <span className={yearTransactions.length > 0 ? `${styles.dot} ${styles.dotDone}` : styles.dot}>
              ✓
            </span>
            <Text className={styles.stepLabel}>帳簿</Text>
            <Text variant="muted">
              取引 {yearTransactions.length} 件
              {unclassifiedCount > 0 ? ` ・ 未分類 ${unclassifiedCount} 件` : ""}
            </Text>
          </Row>
        </Row>

        {MANUAL_STEPS.map((step) => {
          const done = status[step.key];
          const doneAt = status[`${step.key}_at`];
          return (
            <Row key={step.key} align="center" justify="spaceBetween">
              <Row align="center" gap="sm" className={styles.grow}>
                <span className={done ? `${styles.dot} ${styles.dotDone}` : styles.dot}>✓</span>
                <Text className={styles.stepLabel}>{step.label}</Text>
                <Text variant="muted">{done && doneAt ? `${formatDate(doneAt)} 済み` : "未"}</Text>
              </Row>
              <Button
                variant={done ? "ghost" : "primary"}
                size="sm"
                disabled={saving}
                onClick={() => void toggleStep(step.key, done)}
              >
                {done ? "戻す" : step.doneAction}
              </Button>
            </Row>
          );
        })}
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
