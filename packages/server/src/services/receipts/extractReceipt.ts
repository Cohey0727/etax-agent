/**
 * extractReceipt.ts — 領収書・レシート画像の読み取り（services/receipts）。
 *
 * 画像対応LLM（AGENT_* のゲートウェイ）に画像を渡し、日付・合計金額（税込）・
 * 支払先・摘要を JSON で抽出する。金額や日付はモデルの応答をそのまま
 * 信じず、形式チェックを通ったものだけを返す（読めなければ null）。
 * 科目の判定は services/classification が担う（ここでは読み取りだけ）。
 */
import { LLMClient } from "../../gateways/llmGateway";

export interface ReceiptImage {
  mimeType: string;
  dataBase64: string;
}

export interface ExtractedReceipt {
  /** YYYY-MM-DD。読めなければ null。 */
  date: string | null;
  /** 合計金額（税込・円・正の数）。読めなければ null。 */
  amount: number | null;
  /** 支払先（店名・発行者）。 */
  payee: string;
  /** 摘要（品目の要約）。科目判定の入力になる。 */
  description: string;
}

const EXTRACT_PROMPT = [
  "この領収書・レシートの画像から、次のJSONだけを返してください（説明文は不要）。",
  '{"date":"YYYY-MM-DD","amount":合計金額（税込・数値のみ）,"payee":"支払先の店名・会社名","description":"品目の要約（科目判定に使うので具体的に）"}',
  "読み取れない項目は null にしてください。金額はカンマや円記号を含めない数値にしてください。",
].join("\n");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** モデル応答から最初の JSON オブジェクトを取り出す（コードフェンス等を吸収）。 */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 画像から領収書の項目を抽出する。依存（LLMクライアント）は引数で受ける。 */
export async function extractReceipt(
  image: ReceiptImage,
  llm: LLMClient,
): Promise<ExtractedReceipt> {
  const result = await llm.chat([
    {
      role: "user",
      content: EXTRACT_PROMPT,
      images: [{ mimeType: image.mimeType, dataBase64: image.dataBase64 }],
    },
  ]);
  const parsed = parseJsonObject(result.content);
  if (!parsed) {
    throw new Error("領収書の読み取り結果を解釈できませんでした。画像を変えて再試行してください。");
  }
  const dateRaw = typeof parsed["date"] === "string" ? parsed["date"] : "";
  const amountRaw = parsed["amount"];
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw)
      ? Math.trunc(Math.abs(amountRaw))
      : typeof amountRaw === "string" && Number.isFinite(Number(amountRaw.replace(/[^\d.-]/g, "")))
        ? Math.trunc(Math.abs(Number(amountRaw.replace(/[^\d.-]/g, ""))))
        : null;
  return {
    date: DATE_RE.test(dateRaw) ? dateRaw : null,
    amount,
    payee: typeof parsed["payee"] === "string" ? parsed["payee"] : "",
    description: typeof parsed["description"] === "string" ? parsed["description"] : "",
  };
}
