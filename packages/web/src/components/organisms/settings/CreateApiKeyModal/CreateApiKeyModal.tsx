/**
 * CreateApiKeyModal.tsx — API キーの発行モーダル（名前＋有効期限）。
 * 親が開くたびにマウントし直す前提で、入力状態はこの中だけに持つ。
 * 有効期限はプリセット（無期限/30日/90日/1年）か任意の日付（その日の終わりまで）。
 */
import { useState } from "react";
import { Button, Col, Input, Row, Select, Text } from "@components/atoms";
import { Modal } from "@components/molecules";

export interface CreateApiKeyModalProps {
  busy: boolean;
  onClose: () => void;
  /** expiresAt は ISO 文字列。null は無期限。 */
  onSubmit: (name: string, expiresAt: string | null) => void;
}

const EXPIRY_OPTIONS = [
  { value: "never", label: "無期限" },
  { value: "30", label: "30日" },
  { value: "90", label: "90日" },
  { value: "365", label: "1年" },
  { value: "custom", label: "日付を指定" },
] as const;

type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]["value"];

const DAY_MS = 24 * 60 * 60 * 1000;

export const CreateApiKeyModal = ({ busy, onClose, onSubmit }: CreateApiKeyModalProps) => {
  const [name, setName] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>("never");
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const resolved = resolveExpiresAt(expiryChoice, customDate);
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }
    onSubmit(name.trim(), resolved.expiresAt);
  };

  return (
    <Modal open title="APIキーを発行" onClose={onClose}>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="statLabel">名前</Text>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="キーの名前（例: Claude Code）"
            aria-label="APIキーの名前"
            maxLength={100}
          />
        </Col>
        <Col gap="sm">
          <Text variant="statLabel">有効期限</Text>
          <Select
            value={expiryChoice}
            onChange={(e) => setExpiryChoice(e.target.value as ExpiryChoice)}
            aria-label="有効期限"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {expiryChoice === "custom" ? (
            <Input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              aria-label="有効期限の日付"
            />
          ) : null}
          <Text variant="caption">
            期限を過ぎたキーは自動で使えなくなります。無期限のキーもあとから失効できます。
          </Text>
        </Col>
        {error ? <Text variant="caption">⚠ {error}</Text> : null}
        <Row gap="sm">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={busy}>
            {busy ? "発行中…" : "発行する"}
          </Button>
        </Row>
      </Col>
    </Modal>
  );
};

/** 有効期限の選択を ISO 文字列へ解決する。custom の不正は error で返す。 */
function resolveExpiresAt(
  choice: ExpiryChoice,
  customDate: string,
): { ok: true; expiresAt: string | null } | { ok: false; error: string } {
  if (choice === "never") return { ok: true, expiresAt: null };
  if (choice === "custom") {
    if (customDate === "") return { ok: false, error: "有効期限の日付を指定してください" };
    const date = new Date(`${customDate}T23:59:59`);
    if (Number.isNaN(date.getTime())) return { ok: false, error: "有効期限の日付が不正です" };
    if (date.getTime() <= Date.now()) {
      return { ok: false, error: "有効期限には未来の日付を指定してください" };
    }
    return { ok: true, expiresAt: date.toISOString() };
  }
  const days = Number(choice);
  return { ok: true, expiresAt: new Date(Date.now() + days * DAY_MS).toISOString() };
}
