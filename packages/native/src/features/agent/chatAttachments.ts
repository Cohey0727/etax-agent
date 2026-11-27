import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { ChatAttachmentUpload, encodeBase64, readLocalFileBytes } from "@/api";

/** 送信前に保持する添付（読み込み済みの実データつき）。 */
export interface PendingAttachment extends ChatAttachmentUpload {
  id: string;
}

/** 添付の上限（Web・サーバーと揃える）。 */
export const MAX_CHAT_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

let seq = 0;
function nextId(): string {
  seq += 1;
  return `att-${Date.now()}-${seq}`;
}

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** 端末上のファイル（URI）を検証して添付データへ読み込む。 */
export async function readAttachmentFile(
  uri: string,
  name: string,
  mimeType: string | null,
): Promise<PendingAttachment> {
  const isCsv = (mimeType === "text/csv" || name.toLowerCase().endsWith(".csv")) && !IMAGE_MIMES.has(mimeType ?? "");
  const isPdf = mimeType === "application/pdf";
  if (!isCsv && !isPdf && !IMAGE_MIMES.has(mimeType ?? "")) {
    throw new Error(`対応していないファイル形式です: ${name}（画像・PDF・CSV が添付できます）`);
  }
  const file = new File(uri);
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`ファイルが大きすぎます（上限 10MB）: ${name}`);
  }
  if (isCsv) {
    return { id: nextId(), name, mimeType: "text/csv", text: await file.text() };
  }
  const bytes = await readLocalFileBytes(uri);
  return {
    id: nextId(),
    name,
    mimeType: mimeType ?? "application/octet-stream",
    dataBase64: encodeBase64(bytes),
  };
}

/** 画像ライブラリから画像を選ぶ。キャンセル時は空配列。 */
export async function pickImageAttachments(): Promise<PendingAttachment[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("写真へのアクセスが許可されていません");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_CHAT_ATTACHMENTS,
  });
  if (result.canceled) return [];
  const out: PendingAttachment[] = [];
  for (const asset of result.assets) {
    const name = asset.fileName ?? `image-${out.length + 1}.jpg`;
    const mimeType = asset.mimeType ?? "image/jpeg";
    if (asset.base64) {
      out.push({ id: nextId(), name, mimeType, dataBase64: asset.base64 });
    } else {
      out.push(await readAttachmentFile(asset.uri, name, mimeType));
    }
  }
  return out;
}

/** ファイル（PDF・CSV）を選ぶ。キャンセル時は空配列。 */
export async function pickDocumentAttachments(): Promise<PendingAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "text/csv", "text/comma-separated-values"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  const out: PendingAttachment[] = [];
  for (const asset of result.assets) {
    out.push(await readAttachmentFile(asset.uri, asset.name, asset.mimeType ?? null));
  }
  return out;
}

/** 保持中の添付を送信用の形へ（内部の id を落とす）。 */
export function toChatAttachmentUpload(pending: PendingAttachment): ChatAttachmentUpload {
  return {
    name: pending.name,
    mimeType: pending.mimeType,
    ...(pending.dataBase64 ? { dataBase64: pending.dataBase64 } : {}),
    ...(pending.text ? { text: pending.text } : {}),
  };
}
