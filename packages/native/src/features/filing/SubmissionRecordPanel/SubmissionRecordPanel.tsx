import * as DocumentPicker from "expo-document-picker";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton, AppText, Card, Field, SkeletonCard } from "@/components";
import {
  FilingSubmission,
  FilingSubmissionKind,
  deleteFilingSubmission,
  downloadApiFile,
  fetchFilingSubmissions,
  filingReceiptContentPath,
  saveFilingSubmission,
  shareFile,
  uploadFilingReceiptPdf,
} from "@/api";
import { space } from "@/theme";
import { SectionHead } from "../fields";
import { SubmissionHistorySheet } from "../SubmissionHistorySheet";

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
 * 提出の記録パネル。e-Tax で提出した後に、受信通知の受付番号と提出日を
 * 手入力で残し、受信通知PDFを添付して保管する。受付番号を保存すると
 * 申告ステータスの「提出済み」と連動する（サーバー側）。
 */
export function SubmissionRecordPanel({ year, kind }: SubmissionRecordPanelProps) {
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

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
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

  const handleUpload = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await uploadFilingReceiptPdf(year, kind, picked.assets[0].uri);
      setSubmission(updated);
      setMessage("受信通知PDFを添付しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "受信通知PDFの添付に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenReceipt = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await downloadApiFile(
        filingReceiptContentPath(year, kind),
        `受信通知-${year}-${kind}.pdf`,
      );
      await shareFile(file, "application/pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "受信通知PDFを開けませんでした");
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
      <View style={styles.wrap}>
        <SectionHead
          title={`提出の記録（${label}）`}
          description="e-Taxで提出が終わったら、受信通知の受付番号をここに残してください。受付番号を保存すると、申告ステータスの「提出済み」と連動します。受信通知PDFも添付して保管できます。"
        />

        {!loaded ? (
          <SkeletonCard />
        ) : !available ? (
          <AppText size="sm" tone="muted">
            提出の記録を保存するサーバーに接続できていません。接続時に使えます。
          </AppText>
        ) : (
          <>
            {recorded ? (
              <AlertBox
                tone="success"
                message={`${label}は申告済みとして記録されています（受付番号: ${submission.acceptance_number}${submission.submitted_date ? `、提出日: ${submission.submitted_date}` : ""}）。`}
              />
            ) : null}
            <Field
              label="受付番号"
              value={acceptanceNumber}
              onChangeText={setAcceptanceNumber}
              placeholder="受信通知に表示される番号"
            />
            <Field
              label="提出日"
              value={submittedDate}
              onChangeText={setSubmittedDate}
              placeholder="YYYY-MM-DD"
              hint="YYYY-MM-DD 形式で入力してください"
            />
            <View style={styles.actions}>
              <AppButton
                label={busy ? "処理中…" : "提出の記録を保存"}
                disabled={busy}
                loading={busy}
                onPress={() => void handleSave()}
              />
              {submission ? (
                <AppButton
                  label={deleteArmed ? "もう一度押すと削除します" : "記録を削除"}
                  variant="ghost"
                  disabled={busy}
                  onPress={() => void handleDelete()}
                />
              ) : null}
              <AppButton
                label="変更履歴"
                variant="ghost"
                onPress={() => setHistoryOpen(true)}
              />
            </View>

            <AppText size="md" weight="semibold">
              受信通知PDF
            </AppText>
            <View style={styles.actions}>
              {submission?.receipt ? (
                <>
                  <AppButton
                    label="受信通知PDFを開く"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() => void handleOpenReceipt()}
                  />
                  <AppButton
                    label="差し替える"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() => void handleUpload()}
                  />
                </>
              ) : (
                <AppButton
                  label="PDFを添付する"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onPress={() => void handleUpload()}
                />
              )}
            </View>
          </>
        )}

        {error ? <AlertBox tone="error" message={error} /> : null}
        {message ? <AlertBox tone="success" message={message} /> : null}
      </View>
      <SubmissionHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        year={year}
        kind={kind}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  actions: { gap: space.sm },
});
