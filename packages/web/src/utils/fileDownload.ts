/** 文字列（XTX など XML）をファイルとしてダウンロードさせる。 */
export function downloadTextFile(filename: string, content: string): void {
  downloadBlob(filename, new Blob([content], { type: "application/xml;charset=utf-8" }));
}

/** Base64 の PDF をファイルとしてダウンロードさせる。 */
export function downloadPdfFile(filename: string, base64: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  downloadBlob(filename, new Blob([bytes], { type: "application/pdf" }));
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
