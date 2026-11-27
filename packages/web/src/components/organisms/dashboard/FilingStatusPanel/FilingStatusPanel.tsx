import { filterYear, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Col, Row, Text } from "@components/atoms";
import { AppView, FilingStatus } from "@types";
import { fetchFilingStatuses } from "@utils/api";
import { formatDate } from "@utils/format";
import styles from "./FilingStatusPanel.css";

type ManualKey = "confirmed" | "calculated";

interface ManualItem {
  key: ManualKey;
  label: string;
}

// 提出は e-Tax で行い、このアプリでは状態を持たないため項目に含めない。
const MANUAL_ITEMS: readonly ManualItem[] = [
  { key: "confirmed", label: "収支" },
  { key: "calculated", label: "控除・計算" },
];

// スケルトン表示用の項目名（実データと同じ並び）。
const SKELETON_LABELS: readonly string[] = [
  "帳簿",
  ...MANUAL_ITEMS.map((item) => item.label),
];

interface StatusRowData {
  label: string;
  done: boolean;
  state: string;
}

export interface FilingStatusPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 確定申告画面へのリンク用。ステータスの変更はそちらで行う。 */
  onNavigate?: (view: AppView) => void;
}

/**
 * 申告ステータス（表示専用）。収支・控除・計算は独立した項目として
 * 一覧で示す（順序を表すステッパーは置かない）。ステータスの変更は
 * 確定申告画面で行い、ここからはリンクで遷移するだけ。
 * 提出は e-Tax で行うため、ここには状態として載せない。
 * 読み込み中は同じ形のスケルトンを出し、DB未接続の環境では何も表示しない。
 */
export const FilingStatusPanel = ({ transactions, year, onNavigate }: FilingStatusPanelProps) => {
  const [statuses, setStatuses] = useState<FilingStatus[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingStatuses().then((result) => {
      if (cancelled) return;
      setStatuses(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const status = statuses?.find((s) => s.year === year) ?? EMPTY_STATUS;

  // 読み込み中は最終レイアウトと同じ形のスケルトンを出す（出現時のレイアウトシフト防止）。
  if (!loaded) {
    return (
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="sectionTitle">申告ステータス — {year}年分</Text>
            <Text variant="muted">
              収支と控除・計算の進捗表示です。ステータスの変更は確定申告画面で行います。
              提出は e-Tax で行います。
            </Text>
          </Col>
          <Col gap="sm" aria-hidden="true">
            {SKELETON_LABELS.map((label) => (
              <div key={label} className={styles.statusRow}>
                <Text>{label}</Text>
                <span className={styles.skeletonBar} />
              </div>
            ))}
          </Col>
          {onNavigate ? <div className={styles.skeletonFooter} aria-hidden="true" /> : null}
        </Col>
      </Card>
    );
  }

  if (statuses === null) return null;

  const rows: StatusRowData[] = [
    {
      label: "帳簿",
      done: yearTransactions.length > 0,
      state: `取引 ${yearTransactions.length} 件${unclassifiedCount > 0 ? ` ・ 未分類 ${unclassifiedCount} 件` : ""}`,
    },
    ...MANUAL_ITEMS.map((item) => {
      const done = status[item.key];
      const doneAt = status[`${item.key}_at`];
      return {
        label: item.label,
        done,
        state: done && doneAt ? `${formatDate(doneAt)} 確定` : done ? "確定" : "未確定",
      };
    }),
  ];

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">申告ステータス — {year}年分</Text>
          <Text variant="muted">
            収支と控除・計算の進捗表示です。ステータスの変更は確定申告画面で行います。
            提出は e-Tax で行います。
          </Text>
        </Col>

        <Col gap="sm">
          {rows.map((row) => (
            <div key={row.label} className={styles.statusRow}>
              <Text className={styles.itemLabel}>
                {row.label}
                <Badge tone={row.done ? "accent" : "muted"}>{row.done ? "確定" : "未確定"}</Badge>
              </Text>
              <Text variant="muted">{row.state}</Text>
            </div>
          ))}
        </Col>

        {onNavigate ? (
          <Row gap="sm">
            <Button variant="ghost" size="sm" onClick={() => onNavigate(AppView.Filing)}>
              確定申告画面を開く →
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
