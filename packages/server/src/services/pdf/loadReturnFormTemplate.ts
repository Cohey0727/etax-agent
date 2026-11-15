/**
 * loadReturnFormTemplate.ts — 申告書様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 国税庁公開の公式様式（令和7年分以降用・第一表/第二表）を下地にする。
 * 探索順: 環境変数 ETAX_FORM_PDF_PATH → データフォルダ/forms 配下。
 * 無ければ国税庁サイトから取得してデータフォルダへキャッシュする。
 * 取得もできない場合は null を返し、呼び出し側が 503 で案内する。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../../lib/config";

const TEMPLATE_FILE = "shinkokusho-r07-01.pdf";
const TEMPLATE_URL =
  "https://www.nta.go.jp/taxes/shiraberu/shinkoku/yoshiki/01/shinkokusho/pdf/r07/01.pdf";

let cached: Uint8Array | null = null;

/** 様式 PDF のバイト列を返す。用意できなければ null。 */
export async function loadReturnFormTemplate(): Promise<Uint8Array | null> {
  if (cached) return cached;
  const envPath = process.env.ETAX_FORM_PDF_PATH?.trim();
  const cachePath = join(serverDataDir(), "forms", TEMPLATE_FILE);
  const candidates = envPath ? [envPath, cachePath] : [cachePath];
  for (const path of candidates) {
    try {
      const bytes = await readFile(path);
      cached = new Uint8Array(bytes);
      return cached;
    } catch {
      // 次の候補へ
    }
  }
  try {
    const res = await fetch(TEMPLATE_URL);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 100_000) return null;
    cached = bytes;
    try {
      await mkdir(join(serverDataDir(), "forms"), { recursive: true });
      await writeFile(cachePath, bytes);
    } catch {
      // キャッシュ保存に失敗しても生成は続ける
    }
    return cached;
  } catch {
    return null;
  }
}
