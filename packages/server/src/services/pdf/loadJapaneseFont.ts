/**
 * loadJapaneseFont.ts — PDF 生成用の日本語フォント読み込み（services/pdf）。
 *
 * 日本語フォントはリポジトリに含めず、サーバーのデータフォルダに置く運用。
 * 探索順: 環境変数 ETAX_FONT_PATH → データフォルダ/fonts 配下の既知ファイル名。
 * 見つからなければ null を返し、呼び出し側が案内メッセージで 503 にする。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../../lib/config";

const FONT_FILE_CANDIDATES = ["ipaexg.ttf", "NotoSansJP-Regular.ttf", "NotoSansCJKjp-Regular.otf"] as const;

let cached: Uint8Array | null = null;

/** 日本語フォントのバイト列を返す。未配置なら null。一度読めたらプロセス内で使い回す。 */
export async function loadJapaneseFont(): Promise<Uint8Array | null> {
  if (cached) return cached;
  const candidates: string[] = [];
  const envPath = process.env.ETAX_FONT_PATH?.trim();
  if (envPath) candidates.push(envPath);
  for (const name of FONT_FILE_CANDIDATES) {
    candidates.push(join(serverDataDir(), "fonts", name));
  }
  for (const path of candidates) {
    try {
      const bytes = await readFile(path);
      cached = new Uint8Array(bytes);
      return cached;
    } catch {
      // 次の候補へ
    }
  }
  return null;
}
