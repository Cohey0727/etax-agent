import { Share } from "react-native";

/**
 * テキストのコピー導線。クリップボード専用モジュールが未導入のため、
 * OS の共有シート（コピー先を含む）で渡す。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}
