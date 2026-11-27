import { ChatAttachmentUpload } from "@types";
import { fileToBase64 } from "@utils";

/**
 * chatAttachments.ts — チャット添付の読み込みと検証（画面側）。
 * 対応形式はサーバーが処理できるものだけ: 画像（JPEG/PNG/WebP/GIF）・PDF・CSV。
 * 画像・PDF は Base64、CSV はテキストとして保持し、送信時にそのまま渡す。
 */

/** 送信前に保持する添付（読み込み済みの実データつき）。 */
export interface PendingAttachment extends ChatAttachmentUpload {
  id: string;
}

type AttachmentKind = "image" | "pdf" | "csv";

/** 添付の上限。件数はサーバー側の上限と揃える。 */
export const MAX_CHAT_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** MIME タイプ → 添付の種別。ここに無い形式は受け付けない。 */
const ATTACHMENT_KIND_BY_MIME: Record<string, AttachmentKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv",
};

// 添付の id（画面の中で一意なら足りる。crypto.randomUUID は http で開くと使えない）。
let nextAttachmentId = 0;

/** ファイル選択ダイアログの accept（CSV は拡張子でも拾う）。 */
export const ATTACH_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/csv,.csv";

const kindOfFile = (file: File): AttachmentKind | null => {
  const byMime = ATTACHMENT_KIND_BY_MIME[file.type];
  if (byMime) return byMime;
  // CSV は MIME が空・汎用のことがあるため拡張子でも判定する。
  return file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
};

/** ファイルを検証して添付データへ読み込む。不正なら理由を Error で投げる。 */
export const readAttachment = async (file: File): Promise<PendingAttachment> => {
  const kind = kindOfFile(file);
  if (!kind) {
    throw new Error(
      `対応していないファイル形式です: ${file.name}（画像・PDF・CSV が添付できます）`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`ファイルが大きすぎます（上限 10MB）: ${file.name}`);
  }
  nextAttachmentId += 1;
  const id = `attachment-${nextAttachmentId}`;
  if (kind === "csv") {
    return { id, name: file.name, mimeType: "text/csv", text: await file.text() };
  }
  return {
    id,
    name: file.name,
    mimeType: file.type,
    dataBase64: await fileToBase64(file),
  };
};

/** 保持中の添付を送信用の形へ（内部の id を落とす）。 */
export const toChatAttachmentUpload = (pending: PendingAttachment): ChatAttachmentUpload => ({
  name: pending.name,
  mimeType: pending.mimeType,
  ...(pending.dataBase64 ? { dataBase64: pending.dataBase64 } : {}),
  ...(pending.text ? { text: pending.text } : {}),
});
