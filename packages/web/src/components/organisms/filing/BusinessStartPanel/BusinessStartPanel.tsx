import { BLUE_BOOK_OPTIONS, businessStartDeadlines } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Col, Row, SkeletonBar, Text, Textarea } from "@components/atoms";
import { RetryNotice } from "@components/molecules/RetryNotice";
import {
  BusinessStartIncomeType,
  BusinessStartInputs,
  XtxTaxpayerInput,
} from "@types";
import {
  CheckRow,
  DeadlineRow,
  NullableBoolField,
  SalaryRowFields,
  SelectField,
  SubmissionGuide,
  TextField,
  formatJapaneseDate,
} from "./businessStartFields";
import {
  exportBlueReturnPdfFile,
  exportOpeningNoticePdfFile,
  saveBusinessStartInputsToServer,
} from "@utils/api";
import { downloadPdfFile } from "@utils/fileDownload";
import { todayIso } from "@utils/localDate";
import { loadTaxpayer } from "@components/organisms/filing/TaxpayerProfilePanel/taxpayerStorage";
import {
  emptyBusinessStartInputs,
  loadBusinessStartInputs,
} from "./businessStartStorage";
import styles from "./BusinessStartPanel.css";

export interface BusinessStartPanelProps {
  year: number;
}

type SalaryRowKey = "salary_family" | "salary_employee" | "salary_other";

const SAVE_DELAY_MS = 600;
const SKELETON_ROWS: readonly number[] = [1, 2, 3];

const INCOME_TYPE_OPTIONS: readonly { key: BusinessStartIncomeType; label: string }[] = [
  { key: "business", label: "事業（農業）所得" },
  { key: "real_estate", label: "不動産所得" },
  { key: "forest", label: "山林所得" },
];

const SALARY_ROWS: readonly { key: SalaryRowKey; label: string }[] = [
  { key: "salary_family", label: "専従者" },
  { key: "salary_employee", label: "使用人" },
  { key: "salary_other", label: "その他" },
];

const BOOKKEEPING_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "未選択" },
  { value: "double", label: "複式簿記" },
  { value: "simple", label: "簡易簿記" },
  { value: "other", label: "その他" },
];

/**
 * 開業届（個人事業の開業・廃業等届出書）と青色申告承認申請書のパネル。
 * プロフィールに無い項目だけを専用入力として持ち、サーバーのDBへ所有者
 * ごとに保存する（年度には属さない）。開業日から各届出の期限を計算して
 * 表示し、公式様式へ値を重ねた印刷用 PDF を出力する。提出そのものは
 * e-Tax 等で本人が行う（アプリ内送信はしない）。
 */
export const BusinessStartPanel = ({ year }: BusinessStartPanelProps) => {
  const [inputs, setInputs] = useState<BusinessStartInputs>(() => emptyBusinessStartInputs());
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput | null>(null);
  const [exporting, setExporting] = useState<"opening" | "blue" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<BusinessStartInputs | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBusinessStartInputs().then((result) => {
      if (cancelled) return;
      if (result.status === "failed") {
        setLoadFailed(true);
        return;
      }
      if (result.status === "loaded") setInputs(result.value);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    void loadTaxpayer(year).then((next) => {
      if (!cancelled && next) setTaxpayer(next.taxpayer);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  // 画面を離れるとき、保存待ちの入力があれば即座に保存する。
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBusinessStartInputsToServer(pending);
    };
  }, []);

  const update = (patch: Partial<BusinessStartInputs>) => {
    const next = { ...inputs, ...patch };
    setInputs(next);
    if (!loaded) return;
    pendingRef.current = next;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBusinessStartInputsToServer(pending);
    }, SAVE_DELAY_MS);
  };

  const toggleIncomeType = (key: BusinessStartIncomeType, checked: boolean) => {
    const next = checked
      ? [...inputs.income_types, key]
      : inputs.income_types.filter((type) => type !== key);
    update({ income_types: next });
  };


  const toggleBook = (key: string, checked: boolean) => {
    const next = checked ? [...inputs.books, key] : inputs.books.filter((book) => book !== key);
    update({ books: next });
  };

  const updateOffice = (index: number, patch: Partial<{ name: string; location: string }>) => {
    const offices = inputs.offices.map((office, i) => (i === index ? { ...office, ...patch } : office));
    update({ offices });
  };

  const handleExport = async (kind: "opening" | "blue") => {
    if (!taxpayer) {
      setError("納税者プロフィールを読み込めていないため、出力できません。");
      return;
    }
    setExporting(kind);
    setMessage(null);
    setError(null);
    try {
      const request = { submission_date: todayIso(), taxpayer, inputs };
      const result = kind === "opening"
        ? await exportOpeningNoticePdfFile(request)
        : await exportBlueReturnPdfFile(request);
      downloadPdfFile(result.filename, result.pdf_base64);
      setMessage(
        `${result.filename} をダウンロードしました。公式様式に記入した印刷用 PDF です。提出は下の「提出のしかた」に沿って e-Tax 等で行ってください。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF の出力に失敗しました");
    } finally {
      setExporting(null);
    }
  };

  if (!loaded) {
    return (
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">開業届・青色申告承認申請書</Text>
          {loadFailed ? (
            <RetryNotice
              message="開業届・青色申告承認申請書の入力をサーバーから読み込めませんでした。"
              onRetry={() => {
                setLoadFailed(false);
                setLoadAttempt((n) => n + 1);
              }}
            />
          ) : (
            SKELETON_ROWS.map((row) => (
              <Row key={row} gap="sm">
                <SkeletonBar width="120px" height={14} />
                <SkeletonBar height={36} />
              </Row>
            ))
          )}
        </Col>
      </Card>
    );
  }

  const deadlines = businessStartDeadlines(inputs.start_date);

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">開業届・青色申告承認申請書</Text>
          <Text variant="muted">
            開業したときの届出2点を作成します。氏名・住所などは納税者情報（プロフィール）を使い、
            ここでは様式ごとの項目だけを入力します。入力は自動で保存されます（年度には属しません）。
          </Text>
        </Col>

        <TextField label="開業日" type="date" value={inputs.start_date} onChange={(v) => update({ start_date: v })} />
        <TextField label="屋号のフリガナ" placeholder="ヤマダシステム" value={inputs.shop_name_kana} onChange={(v) => update({ shop_name_kana: v })} />
        <Row gap="sm">
          <div className={styles.fieldLabel}><Text variant="muted">事業の概要（開業届）</Text></div>
          <Textarea className={styles.fieldInput} value={inputs.business_overview}
            placeholder="Webアプリケーションの受託開発など、できるだけ具体的に"
            onChange={(e) => update({ business_overview: e.target.value })}
            aria-label="事業の概要" />
        </Row>
        <Row gap="sm" align="center" wrap>
          <div className={styles.fieldLabel}><Text variant="muted">所得の種類</Text></div>
          {INCOME_TYPE_OPTIONS.map((option) => (
            <CheckRow key={option.key} label={option.label}
              checked={inputs.income_types.includes(option.key)}
              onChange={(checked) => toggleIncomeType(option.key, checked)} />
          ))}
        </Row>

        {deadlines ? (
          <Col gap="sm">
            <Text variant="muted">
              開業日（{formatJapaneseDate(deadlines.startDate)}）から計算した提出期限の目安です。
            </Text>
            <DeadlineRow name="個人事業の開業・廃業等届出書" deadline={deadlines.openingNotice} />
            <DeadlineRow name="所得税の青色申告承認申請書" deadline={deadlines.blueReturnApplication} />
            <DeadlineRow name="給与支払事務所等の開設届出書" deadline={deadlines.salaryOffice} />
          </Col>
        ) : (
          <Text variant="muted">開業日を入力すると、各届出の提出期限の目安を表示します。</Text>
        )}

        <Text variant="sectionTitle">開業届の項目</Text>
        <CheckRow label="「青色申告承認申請書」をあわせて提出する" wide checked={inputs.submits_blue_application} onChange={(checked) => update({ submits_blue_application: checked })} />
        <CheckRow label="消費税の「課税事業者選択届出書」をあわせて提出する" wide checked={inputs.submits_consumption_election} onChange={(checked) => update({ submits_consumption_election: checked })} />
        <TextField label="納税地以外の郵便番号" placeholder="1000001" value={inputs.other_zip_code} onChange={(v) => update({ other_zip_code: v })} />
        <TextField label="納税地以外の住所地・事業所等" placeholder="東京都千代田区千代田1-1" value={inputs.other_address} onChange={(v) => update({ other_address: v })} />
        <TextField label="納税地以外の電話番号" placeholder="03-1234-5678" value={inputs.other_phone} onChange={(v) => update({ other_phone: v })} />
        {SALARY_ROWS.map((row) => (
          <SalaryRowFields key={row.key}
            label={row.key === "salary_other" && inputs.salary_other_label ? inputs.salary_other_label : row.label}
            row={inputs[row.key]}
            onChange={(next) => update({ [row.key]: next } as Partial<BusinessStartInputs>)} />
        ))}
        <TextField label="給与の状況・3行目の区分名" placeholder="その他行の区分名（任意）" value={inputs.salary_other_label} onChange={(v) => update({ salary_other_label: v })} />
        <NullableBoolField label="源泉所得税の納期の特例の申請書を提出する" value={inputs.withholding_special} onChange={(v) => update({ withholding_special: v })} />
        <TextField label="給与支払を開始する年月日" type="date" value={inputs.salary_start_date} onChange={(v) => update({ salary_start_date: v })} />
        <TextField label="その他参考事項（開業届）" value={inputs.other_notes} onChange={(v) => update({ other_notes: v })} />

        <Text variant="sectionTitle">青色申告承認申請書の項目</Text>
        <TextField label="青色申告を開始する年分" type="number"
          value={inputs.blue_start_year === 0 ? "" : String(inputs.blue_start_year)}
          placeholder="空欄なら開業年"
          onChange={(v) => update({ blue_start_year: v === "" ? 0 : Number(v) || 0 })} />
        {inputs.offices.map((office, index) => (
          <Col key={index} gap="sm">
            <TextField label={`事業所${index + 1}の名称`} placeholder="ヤマダシステム" value={office.name} onChange={(v) => updateOffice(index, { name: v })} />
            <TextField label={`事業所${index + 1}の所在地`} placeholder="東京都千代田区千代田1-1" value={office.location} onChange={(v) => updateOffice(index, { location: v })} />
          </Col>
        ))}
        <NullableBoolField label="青色申告承認の取消し・取りやめを受けたことがある" value={inputs.blue_cancellation_has} onChange={(v) => update({ blue_cancellation_has: v })} />
        <TextField label="取消し・取りやめの日" type="date" value={inputs.blue_cancellation_date} onChange={(v) => update({ blue_cancellation_date: v })} />
        <NullableBoolField label="相続による事業承継がある" value={inputs.inheritance_has} onChange={(v) => update({ inheritance_has: v })} />
        <TextField label="相続開始年月日" type="date" value={inputs.inheritance_date} onChange={(v) => update({ inheritance_date: v })} />
        <TextField label="被相続人の氏名" value={inputs.predecessor_name} onChange={(v) => update({ predecessor_name: v })} />
        <SelectField label="簿記方式" value={inputs.bookkeeping ?? ""} options={BOOKKEEPING_OPTIONS} onChange={(v) => update({ bookkeeping: v === "" ? null : (v as BusinessStartInputs["bookkeeping"]) })} />
        {inputs.bookkeeping === "other" ? (
          <TextField label="簿記方式（その他）" value={inputs.bookkeeping_other} onChange={(v) => update({ bookkeeping_other: v })} />
        ) : null}
        <Row gap="sm" wrap>
          <div className={styles.fieldLabel}><Text variant="muted">備付帳簿名</Text></div>
          {BLUE_BOOK_OPTIONS.map((option) => (
            <CheckRow key={option.key} label={option.label}
              checked={inputs.books.includes(option.key)}
              onChange={(checked) => toggleBook(option.key, checked)} />
          ))}
        </Row>
        <TextField label="その他参考事項（青色）" value={inputs.blue_other_notes} onChange={(v) => update({ blue_other_notes: v })} />

        <Row gap="sm" wrap>
          <Button onClick={() => void handleExport("opening")} disabled={exporting !== null}
            disabledReason="出力中です">
            開業届 PDF を作成
          </Button>
          <Button onClick={() => void handleExport("blue")} disabled={exporting !== null}
            disabledReason="出力中です">
            青色申告承認申請書 PDF を作成
          </Button>
        </Row>
        {message ? <Text variant="muted">{message}</Text> : null}
        {error ? <Text variant="muted">{error}</Text> : null}

        <SubmissionGuide />
      </Col>
    </Card>
  );
};
