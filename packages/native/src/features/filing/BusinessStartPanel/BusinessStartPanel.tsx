import { businessStartDeadlines } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  AlertBox,
  AppButton,
  AppText,
  Card,
  DateField,
  Field,
  SkeletonBar,
  SwitchRow,
} from "@/components";
import {
  BusinessStartIncomeType,
  BusinessStartInputs,
  exportBlueReturnPdfFile,
  exportOpeningNoticePdfFile,
  saveBase64ToCacheFile,
  saveBusinessStartInputs,
  shareFile,
} from "@/api";
import { space } from "@/theme";
import { emptyBusinessStartInputs, loadBusinessStartInputs } from "../businessStartData";
import { LoadFailedNotice } from "../fields";
import { taxpayerProfileStore, todayIso } from "../taxpayerData";
import { useYearInput } from "../useYearInput";
import {
  DeadlineRow,
  SubmissionGuide,
  formatJapaneseDate,
} from "./businessStartFields";
import { BlueReturnFields, OpeningNoticeFields } from "./BusinessStartSections";

export interface BusinessStartPanelProps {
  year: number;
}

const SAVE_DELAY_MS = 600;
const skeletonRows: readonly number[] = [1, 2, 3];

type LoadStatus = "loading" | "failed" | "ready";

const incomeTypeOptions: readonly { key: BusinessStartIncomeType; label: string }[] = [
  { key: "business", label: "事業（農業）所得" },
  { key: "real_estate", label: "不動産所得" },
  { key: "forest", label: "山林所得" },
];


/**
 * 開業届（個人事業の開業・廃業等届出書）と青色申告承認申請書のパネル。
 * プロフィールに無い項目だけを専用入力として持ち、サーバーのDBへ所有者
 * ごとに保存する（年度には属さない）。開業日から各届出の期限を計算して
 * 表示し、公式様式へ値を重ねた印刷用 PDF を出力する。提出そのものは
 * e-Tax 等で本人が行う（アプリ内送信はしない）。
 * 生成 PDF は端末に保存して共有シートで渡す。
 */
export function BusinessStartPanel({ year }: BusinessStartPanelProps) {
  const [inputs, setInputs] = useState<BusinessStartInputs>(() => emptyBusinessStartInputs());
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  // 同じ画面の納税者情報の編集欄と同じ値を読む（編集した直後の出力にもそのまま使われる）
  const { entry: profileEntry } = useYearInput(taxpayerProfileStore, year);
  const [exporting, setExporting] = useState<"opening" | "blue" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<BusinessStartInputs | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBusinessStartInputs().then((saved) => {
      if (cancelled) return;
      if (saved) setInputs(saved);
      setLoadStatus(saved ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const retryLoad = () => {
    setLoadStatus("loading");
    setLoadAttempt((n) => n + 1);
  };

  // 画面を離れるとき、保存待ちの入力があれば即座に保存する。
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBusinessStartInputs(pending);
    };
  }, []);

  const update = (patch: Partial<BusinessStartInputs>) => {
    if (loadStatus !== "ready") return;
    const next = { ...inputs, ...patch };
    setInputs(next);
    pendingRef.current = next;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBusinessStartInputs(pending);
    }, SAVE_DELAY_MS);
  };

  const toggleIncomeType = (key: BusinessStartIncomeType, checked: boolean) => {
    const next = checked
      ? [...inputs.income_types, key]
      : inputs.income_types.filter((type) => type !== key);
    update({ income_types: next });
  };

  const handleExport = async (kind: "opening" | "blue") => {
    if (profileEntry.status !== "ready") {
      setError("納税者プロフィールを読み込めていないため、出力できません。");
      return;
    }
    const { taxpayer } = profileEntry.value;
    setExporting(kind);
    setMessage(null);
    setError(null);
    try {
      const request = { submission_date: todayIso(), taxpayer, inputs };
      const result =
        kind === "opening"
          ? await exportOpeningNoticePdfFile(request)
          : await exportBlueReturnPdfFile(request);
      const file = saveBase64ToCacheFile(result.filename, result.pdf_base64);
      await shareFile(file, "application/pdf");
      setMessage(
        `${result.filename} を保存しました。公式様式に記入した印刷用 PDF です。提出は下の「提出のしかた」に沿って e-Tax 等で行ってください。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF の出力に失敗しました");
    } finally {
      setExporting(null);
    }
  };

  if (loadStatus !== "ready") {
    return (
      <Card>
        <View style={styles.wrap}>
          <AppText size="lg" weight="bold">
            開業届・青色申告承認申請書
          </AppText>
          {loadStatus === "failed" ? (
            <LoadFailedNotice
              message="開業届・青色申告承認申請書の入力を取得できませんでした。"
              onRetry={retryLoad}
            />
          ) : (
            skeletonRows.map((row) => (
              <View key={row} style={styles.skeletonRow}>
                <SkeletonBar width="30%" height={14} />
                <SkeletonBar height={36} />
              </View>
            ))
          )}
        </View>
      </Card>
    );
  }

  const deadlines = businessStartDeadlines(inputs.start_date);

  return (
    <Card>
      <View style={styles.wrap}>
        <AppText size="lg" weight="bold">
          開業届・青色申告承認申請書
        </AppText>
        <AppText size="sm" tone="muted">
          開業したときの届出2点を作成します。氏名・住所などは納税者情報（プロフィール）を使い、
          ここでは様式ごとの項目だけを入力します。入力は自動で保存されます（年度には属しません）。
        </AppText>

        <DateField
          label="開業日"
          clearable
          value={inputs.start_date}
          onChange={(v) => update({ start_date: v })}
        />
        <Field
          label="屋号のフリガナ"
          placeholder="ヤマダシステム"
          value={inputs.shop_name_kana}
          onChangeText={(v) => update({ shop_name_kana: v })}
        />
        <Field
          label="事業の概要（開業届）"
          value={inputs.business_overview}
          onChangeText={(v) => update({ business_overview: v })}
          placeholder="Webアプリケーションの受託開発など、できるだけ具体的に"
          multiline
        />
        <AppText size="sm" weight="semibold" tone="subtle">
          所得の種類
        </AppText>
        {incomeTypeOptions.map((option) => (
          <SwitchRow
            key={option.key}
            label={option.label}
            value={inputs.income_types.includes(option.key)}
            onChange={(checked) => toggleIncomeType(option.key, checked)}
          />
        ))}

        {deadlines ? (
          <View style={styles.deadlines}>
            <AppText size="sm" tone="muted">
              開業日（{formatJapaneseDate(deadlines.startDate)}）から計算した提出期限の目安です。
            </AppText>
            <DeadlineRow name="個人事業の開業・廃業等届出書" deadline={deadlines.openingNotice} />
            <DeadlineRow
              name="所得税の青色申告承認申請書"
              deadline={deadlines.blueReturnApplication}
            />
            <DeadlineRow name="給与支払事務所等の開設届出書" deadline={deadlines.salaryOffice} />
          </View>
        ) : (
          <AppText size="sm" tone="muted">
            開業日を入力すると、各届出の提出期限の目安を表示します。
          </AppText>
        )}

        <OpeningNoticeFields inputs={inputs} update={update} />
        <BlueReturnFields inputs={inputs} update={update} />

        <View style={styles.actions}>
          <AppButton
            label={exporting === "opening" ? "出力中…" : "開業届 PDF を作成"}
            disabled={exporting !== null}
            loading={exporting === "opening"}
            onPress={() => void handleExport("opening")}
          />
          <AppButton
            label={exporting === "blue" ? "出力中…" : "青色申告承認申請書 PDF を作成"}
            disabled={exporting !== null}
            loading={exporting === "blue"}
            onPress={() => void handleExport("blue")}
          />
        </View>
        {error ? <AlertBox tone="error" message={error} /> : null}
        {message ? <AlertBox tone="success" message={message} /> : null}

        <SubmissionGuide />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  skeletonRow: { gap: 6 },
  deadlines: { gap: space.sm },
  actions: { gap: space.sm },
});
