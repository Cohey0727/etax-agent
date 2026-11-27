import * as Clipboard from "expo-clipboard";

/** テキストをクリップボードへコピーする。成功したら true。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
