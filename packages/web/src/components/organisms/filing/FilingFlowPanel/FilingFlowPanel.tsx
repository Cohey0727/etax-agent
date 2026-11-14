import { filterYear, Transaction } from "@etax/shared";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { ConfirmSummary } from "../ConfirmSummary";
import { AppView, FilingStatus } from "@types";
import { fetchFilingStatuses, updateFilingStatus } from "@utils/api";
import styles from "./FilingFlowPanel.css";

type ManualStepKey = "confirmed" | "calculated" | "submitted";
type StepKey = "ledger" | ManualStepKey;

interface StepLink {
  view: AppView;
  label: string;
}

interface FilingStep {
  key: StepKey;
  label: string;
  description: string;
  /** 手動ステップの「済みにする」ボタンの文言。帳簿ステップは自動判定なので持たない。 */
  doneAction?: string;
  links: readonly StepLink[];
}

const STEPS: readonly FilingStep[] = [
  {
    key: "ledger",
    label: "帳簿",
    description:
      "取引を取り込み、勘定科目と区分（事業／不動産）を付けます。CSV取込・領収書の写真・手入力のどれでも、保存先は同じ帳簿です。",
    links: [
      { view: AppView.Ledger, label: "帳簿を開く" },
      { view: AppView.Import, label: "取引・CSV取込" },
    ],
  },
  {
    key: "confirmed",
    label: "確認",
    description:
      "帳簿の金額・科目・区分に誤りがないか見直します。問題なければ「確認済みにする」を押してください。",
    doneAction: "確認済みにする",
    links: [{ view: AppView.Ledger, label: "帳簿を開く" }],
  },
  {
    key: "calculated",
    label: "控除・計算",
    description:
      "修正申告の画面で所得控除・税額控除を入力すると、所得税額が自動計算されます。計算結果を確認したら「計算済みにする」を押してください。",
    doneAction: "計算済みにする",
    links: [{ view: AppView.Amend, label: "修正申告を開く" }],
  },
  {
    key: "submitted",
    label: "提出",
    description:
      "修正申告の画面で e-Tax 用データ（XTX）を出力し、e-Tax ソフト／WEB版に取り込んで送信します。送信はマイナンバーカードで本人が行う操作です。送信できたら「提出済みにする」を押してください。",
    doneAction: "提出済みにする",
    links: [{ view: AppView.Amend, label: "修正申告を開く" }],
  },
];

export interface FilingFlowPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  onNavigate?: (view: AppView) => void;
}

/**
 * 確定申告のステッパー画面。
 * 帳簿（自動判定）→ 確認 → 控除・計算 → 提出（手動）の4ステップを横並びで示し、
 * 選んだステップの「やること」と移動ボタン・済みボタンを下のカードに出す。
 * 状態はダッシュボードの申告ステータスと同じサーバー保存を共有する。
 */
export const FilingFlowPanel = ({ transactions, year, onNavigate }: FilingFlowPanelProps) => {
  const [statuses, setStatuses] = useState<FilingStatus[] | null>(null);
  const [loadDone, setLoadDone] = useState(false);
  const [saving, setSaving] = useState(false);
  // null の間は「いま取り組むステップ」を自動で選ぶ。クリックしたらそのステップ固定。
  const [selectedKey, setSelectedKey] = useState<StepKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingStatuses().then((result) => {
      if (cancelled) return;
      setStatuses(result);
      setLoadDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const status = statuses?.find((s) => s.year === year) ?? EMPTY_STATUS;

  const doneByKey: Record<StepKey, boolean> = {
    ledger: yearTransactions.length > 0,
    confirmed: status.confirmed,
    calculated: status.calculated,
    submitted: status.submitted,
  };
  const currentIndex = STEPS.findIndex((step) => !doneByKey[step.key]);
  const allDone = currentIndex === -1;
  const effectiveKey: StepKey =
    selectedKey ?? (allDone ? "submitted" : STEPS[currentIndex].key);
  const selectedIndex = STEPS.findIndex((step) => step.key === effectiveKey);
  const selectedStep = STEPS[selectedIndex];
  const selectedDone = doneByKey[selectedStep.key];

  const stateText = (step: FilingStep, index: number): string => {
    if (step.key === "ledger") return `取引 ${yearTransactions.length} 件`;
    if (doneByKey[step.key]) {
      const doneAt = status[`${step.key as ManualStepKey}_at`];
      return doneAt ? `${formatDate(doneAt)} 済み` : "済み";
    }
    return index === currentIndex ? "いまここ" : "未";
  };

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
    <Col gap="lg">
      <Card>
        <Col gap="lg">
          <Col gap="sm">
            <Text variant="sectionTitle">{year}年分の確定申告</Text>
            <Text variant="muted">
              帳簿 → 確認 → 控除・計算 → 提出 の順に進めます。ステップを選ぶと、そのステップで
              やることが下に表示されます。状態はダッシュボードの申告ステータスと共有されます。
            </Text>
            {allDone ? (
              <Col gap="sm">
                <Text>全ステップ完了です。この年の申告は提出済みになっています。</Text>
                <Text variant="muted">
                  提出後に内容の誤りに気づいた場合は、修正申告で訂正します。
                </Text>
                <Row>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!onNavigate}
                    onClick={() => onNavigate?.(AppView.Amend)}
                  >
                    修正申告を開く →
                  </Button>
                </Row>
              </Col>
            ) : null}
          </Col>

          <div className={styles.stepper}>
            {STEPS.map((step, index) => {
              const done = doneByKey[step.key];
              const isCurrent = index === currentIndex;
              const isSelected = step.key === effectiveKey;
              const circleClass = [
                styles.circle,
                done ? styles.circleDone : isCurrent ? styles.circleCurrent : "",
                isSelected ? styles.circleSelected : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <Fragment key={step.key}>
                  {index > 0 ? (
                    <div
                      className={
                        doneByKey[STEPS[index - 1].key]
                          ? `${styles.connector} ${styles.connectorDone}`
                          : styles.connector
                      }
                    />
                  ) : null}
                  <button
                    type="button"
                    className={styles.step}
                    onClick={() => setSelectedKey(step.key)}
                  >
                    <span className={circleClass}>{done ? "✓" : index + 1}</span>
                    <span
                      className={
                        done || isCurrent || isSelected
                          ? `${styles.stepLabel} ${styles.stepLabelActive}`
                          : styles.stepLabel
                      }
                    >
                      {step.label}
                    </span>
                    <span className={styles.stepState}>{stateText(step, index)}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>

          {loadDone && statuses === null ? (
            <Text variant="muted">
              ステータスを保存するサーバーに接続できていません。「済みにする」は接続時に使えます。
            </Text>
          ) : null}
        </Col>
      </Card>

      <Card>
        <Col gap="md">
          <Row align="center" justify="spaceBetween">
            <Text variant="sectionTitle">
              ステップ{selectedIndex + 1}: {selectedStep.label}
            </Text>
            <Text variant="muted">{selectedDone ? "済み" : "未"}</Text>
          </Row>
          <Text>{selectedStep.description}</Text>
          {selectedStep.key === "ledger" ? (
            <Text variant="muted">
              取引 {yearTransactions.length} 件
              {unclassifiedCount > 0
                ? ` ・ 未分類 ${unclassifiedCount} 件が残っています。帳簿で勘定科目を付けてください。`
                : " ・ 未分類はありません。"}
            </Text>
          ) : null}
          {selectedStep.key === "confirmed" ? (
            <ConfirmSummary transactions={transactions} year={year} />
          ) : null}
          <Row gap="sm" align="center">
            {selectedStep.links.map((link, index) => (
              <Button
                key={link.view + link.label}
                variant={!selectedStep.doneAction && index === 0 ? "primary" : "ghost"}
                size="sm"
                disabled={!onNavigate}
                onClick={() => onNavigate?.(link.view)}
              >
                {link.label}
              </Button>
            ))}
            {selectedStep.doneAction ? (
              <Button
                variant={selectedDone ? "ghost" : "primary"}
                size="sm"
                disabled={saving || statuses === null}
                onClick={() =>
                  void toggleStep(selectedStep.key as ManualStepKey, selectedDone)
                }
              >
                {selectedDone ? "戻す" : selectedStep.doneAction}
              </Button>
            ) : null}
          </Row>
        </Col>
      </Card>
    </Col>
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
