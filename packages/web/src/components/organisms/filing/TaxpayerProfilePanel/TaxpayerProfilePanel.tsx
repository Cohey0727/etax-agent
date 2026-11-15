import { useEffect, useRef, useState } from "react";
import { Card, Col, Input, Row, Text } from "@components/atoms";
import { XtxTaxpayerInput } from "@types";
import {
  LoadedTaxpayer,
  emptyTaxpayer,
  loadTaxpayer,
  saveTaxpayer,
} from "./taxpayerStorage";
import styles from "./TaxpayerProfilePanel.css";

/** テキスト入力の項目定義（ラベル列つきで並べる）。 */
const TEXT_FIELDS: readonly {
  key: keyof XtxTaxpayerInput;
  label: string;
  placeholder?: string;
}[] = [
  { key: "name", label: "氏名", placeholder: "山田太郎" },
  { key: "name_kana", label: "フリガナ", placeholder: "ヤマダタロウ" },
  { key: "zip_code", label: "郵便番号", placeholder: "1000001" },
  { key: "address", label: "住所", placeholder: "東京都千代田区千代田1-1" },
  { key: "address_line2", label: "住所（下段）", placeholder: "建物名・部屋番号など" },
  { key: "phone", label: "電話番号", placeholder: "090-1234-5678" },
  { key: "tax_office_name", label: "提出先の税務署名", placeholder: "麹町（「税務署」は付けない）" },
  { key: "tax_office_code", label: "税務署コード（任意）", placeholder: "5桁" },
  { key: "occupation", label: "職業", placeholder: "ソフトウェア開発" },
  { key: "shop_name", label: "屋号（任意）" },
  { key: "jan1_address", label: "1月1日の住所（任意）", placeholder: "現住所と違う場合のみ" },
  { key: "invoice_number", label: "インボイス登録番号", placeholder: "T1234567890123" },
  { key: "my_number", label: "個人番号（任意）", placeholder: "マイナンバー12桁" },
];

/** 異動・変更前の納税地（納税地の異動申出書の出力に使う）。 */
const PREVIOUS_FIELDS: readonly {
  key: keyof XtxTaxpayerInput;
  label: string;
  placeholder?: string;
}[] = [
  { key: "previous_zip_code", label: "異動前の郵便番号", placeholder: "1000001" },
  { key: "previous_address", label: "異動前の住所", placeholder: "東京都千代田区千代田1-1" },
];

/** 入力が止まってからDBへ保存するまでの待ち時間（ミリ秒）。 */
const SAVE_DELAY_MS = 600;

export interface TaxpayerProfilePanelProps {
  year: number;
}

/**
 * 納税者情報の編集パネル（独立画面「納税者情報」の本体）。
 * 申告書の見出しに入る情報で、プロフィールは年度別にサーバー（帳簿DB）へ
 * 保存される。入力は少し待ってから自動で保存され、総合タブの提出パネルや
 * 消費税タブが同じ保存値を読み直して出力に使う。
 */
export const TaxpayerProfilePanel = ({ year }: TaxpayerProfilePanelProps) => {
  const [loaded, setLoaded] = useState<LoadedTaxpayer | null>(null);
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => emptyTaxpayer());
  const pendingRef = useRef<{ year: number; taxpayer: XtxTaxpayerInput } | null>(null);
  const timerRef = useRef<number | null>(null);

  // 年度が切り替わったら、その年度のプロフィール（無ければ引き継ぎ）を読み直す。
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    loadTaxpayer(year).then((next) => {
      if (cancelled) return;
      setLoaded(next);
      setTaxpayer(next.taxpayer);
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
      if (pending) void saveTaxpayer(pending.year, pending.taxpayer);
    };
  }, []);

  const update = (key: keyof XtxTaxpayerInput, value: string) => {
    const next = { ...taxpayer, [key]: value };
    setTaxpayer(next);
    pendingRef.current = { year, taxpayer: next };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveTaxpayer(pending.year, pending.taxpayer);
    }, SAVE_DELAY_MS);
  };

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">納税者情報</Text>
          <Text variant="muted">
            申告書の見出しに入る情報です。プロフィールは年度別にサーバー（この
            アプリのDB）へ保存されます。
          </Text>
          {loaded?.carriedFrom != null ? (
            <Text variant="muted">
              {loaded.carriedFrom}年分のプロフィールを引き継いでいます。変更すると
              {year}年分として保存されます。
            </Text>
          ) : loaded?.carriedFromLegacy ? (
            <Text variant="muted">
              これまでのプロフィールを引き継いでいます。変更すると{year}年分として
              保存されます。
            </Text>
          ) : null}
        </Col>

        {TEXT_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={taxpayer[field.key]}
            onChange={(v) => update(field.key, v)}
          />
        ))}
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">生年月日</Text>
          </div>
          <Input
            className={styles.fieldInput}
            type="date"
            value={taxpayer.birth_date}
            onChange={(e) => update("birth_date", e.target.value)}
            aria-label="生年月日"
          />
        </Row>

        <Text variant="muted">
          異動・変更前の納税地は、納税地の異動申出書（印刷用PDF）の出力に使います。
          転居前の住所を入れておくと、提出パネルから記入済みの申出書を出力できます。
        </Text>
        {PREVIOUS_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={taxpayer[field.key]}
            onChange={(v) => update(field.key, v)}
          />
        ))}
      </Col>
    </Card>
  );
};

interface TextFieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

const TextField = ({ label, placeholder, value, onChange }: TextFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  </Row>
);
