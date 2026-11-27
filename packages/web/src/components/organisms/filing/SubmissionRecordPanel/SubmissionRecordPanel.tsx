import { useEffect, useRef, useState } from "react";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { FilingSubmission, FilingSubmissionKind } from "@types";
import {
  deleteFilingSubmission,
  fetchFilingSubmissions,
  filingReceiptContentPath,
  saveFilingSubmission,
  uploadFilingReceiptPdf,
} from "@utils/api";
import { SubmissionHistoryDrawer } from "../SubmissionHistoryDrawer";
import styles from "./SubmissionRecordPanel.css";

export interface SubmissionRecordPanelProps {
  year: number;
  /** 税目（所得税 / 消費税）。記録は税目ごとに分かれる。 */
  kind: FilingSubmissionKind;
}

const KIND_LABELS: Record<FilingSubmissionKind, string> = {
  income: "所得税",
  consumption: "消費税",
};

/**
 * 提出の記録パネル。e-Tax で提出した後に、
 * 受信通知の受付番号と提出日を手入力で残し、受信通知PDFを添付して
 * 保管する。受付番号を保存すると申告ステータスの「提出済み」と
 * 連動する（サーバー側）。
 */
export const SubmissionRecordPanel = ({ year, kind }: SubmissionRecordPanelProps) => {
  const label = KIND_LABELS[kind];
  const [submission, setSubmission] = useState<FilingSubmission | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [acceptanceNumber, setAcceptanceNumber] = useState("");
  const [submittedDate, setSubmittedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingSubmissions(year).then((list) => {
      if (cancelled) return;
      if (!list) {
        setAvailable(false);
        setLoaded(true);
        return;
      }
      const mine = list.find((s) => s.kind === kind) ?? null;
      setSubmission(mine);
      setAcceptanceNumber(mine?.acceptance_number ?? "");
      setSubmittedDate(mine?.submitted_date ?? "");
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [year, kind]);

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await saveFilingSubmission(year, kind, {
        acceptance_number: acceptanceNumber.trim(),
        submitted_date: submittedDate === "" ? null : submittedDate,
      });
      if (!saved) {
        setError("保存できませんでした。サーバーへの接続を確認してください。");
        return;
      }
      setSubmission(saved);
      setMessage(
        saved.acceptance_number
          ? "提出の記録を保存しました。申告ステータスも「提出済み」になりました。"
          : "提出の記録を保存しました。",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await uploadFilingReceiptPdf(year, kind, file);
      setSubmission(updated);
      setMessage("受信通知PDFを添付しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "受信通知PDFの添付に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleteArmed(false);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const ok = await deleteFilingSubmission(year, kind);
      if (!ok) {
        setError("削除できませんでした。サーバーへの接続を確認してください。");
        return;
      }
      setSubmission(null);
      setAcceptanceNumber("");
      setSubmittedDate("");
      setMessage("提出の記録を削除しました。");
    } finally {
      setBusy(false);
    }
  };

  const recorded = submission !== null && submission.acceptance_number !== "";

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">提出の記録（{label}）</Text>
          <Text variant="muted">
            e-Taxで提出が終わったら、受信通知の受付番号をここに残してください。
            受付番号を保存すると、申告ステータスの「提出済み」と連動します。
            受信通知PDFも添付して保管できます。
          </Text>
        </Col>

        {!loaded ? (
          <Text variant="muted">読み込み中…</Text>
        ) : !available ? (
          <Text variant="muted">
            提出の記録を保存するサーバーに接続できていません。接続時に使えます。
          </Text>
        ) : (
          <>
            {recorded ? (
              <AlertBox>
                {label}は申告済みとして記録されています（受付番号:{" "}
                {submission.acceptance_number}
                {submission.submitted_date ? `、提出日: ${submission.submitted_date}` : ""}）。
              </AlertBox>
            ) : null}
            <Row gap="sm" align="center">
              <div className={styles.fieldLabel}>
                <Text variant="muted">受付番号</Text>
              </div>
              <Input
                className={styles.fieldInput}
                type="text"
                value={acceptanceNumber}
                onChange={(e) => setAcceptanceNumber(e.target.value)}
                placeholder="受信通知に表示される番号"
                aria-label="受付番号"
              />
            </Row>
            <Row gap="sm" align="center">
              <div className={styles.fieldLabel}>
                <Text variant="muted">提出日</Text>
              </div>
              <Input
                className={styles.fieldInput}
                type="date"
                value={submittedDate}
                onChange={(e) => setSubmittedDate(e.target.value)}
                aria-label="提出日"
              />
            </Row>
            <Row gap="sm">
              <Button variant="primary" onClick={() => void handleSave()} disabled={busy} disabledReason="保存中です">
                {busy ? "処理中…" : "提出の記録を保存"}
              </Button>
              {submission ? (
                <Button
                  variant="ghost"
                  onClick={() => void handleDelete()}
                  disabled={busy}
                  disabledReason="処理中です"
                >
                  {deleteArmed ? "もう一度押すと削除します" : "記録を削除"}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                変更履歴
              </Button>
            </Row>

            <Row gap="sm" align="center">
              <div className={styles.fieldLabel}>
                <Text variant="muted">受信通知PDF</Text>
              </div>
              {submission?.receipt ? (
                <Row gap="sm" align="center">
                  <a
                    className={styles.receiptLink}
                    href={filingReceiptContentPath(year, kind)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    受信通知PDFを開く
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    disabledReason="処理中です"
                  >
                    差し替える
                  </Button>
                </Row>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  disabledReason="処理中です"
                >
                  PDFを添付する
                </Button>
              )}
              <input
                ref={fileInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept="application/pdf"
                onChange={(e) => void handleUpload(e.target.files)}
              />
            </Row>
          </>
        )}

        {error ? <AlertBox variant="error">{error}</AlertBox> : null}
        {message ? <AlertBox>{message}</AlertBox> : null}
      </Col>
      <SubmissionHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        year={year}
        kind={kind}
      />
    </Card>
  );
};
