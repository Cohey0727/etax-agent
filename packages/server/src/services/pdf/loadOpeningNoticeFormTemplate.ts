/**
 * loadOpeningNoticeFormTemplate.ts — 開業届様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 国税庁公開の公式様式（個人事業の開業・廃業等届出書、様式ID
 * NTA1KOZ060010040、手続案内 A1-5 の現行様式）を下地にする。
 * 探索順: 環境変数 ETAX_OPENING_FORM_PDF_PATH → データフォルダ/forms 配下。
 * 無ければ国税庁サイトから取得してデータフォルダへキャッシュする。
 * 取得もできない場合は null を返し、呼び出し側が 503 で案内する。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../../lib/config";
import { normalizeFormTemplate } from "./decryptPdfTemplate";

const TEMPLATE_FILE = "kaigyo-todokede.pdf";
const TEMPLATE_URL =
  "https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/pdf/r06/05.pdf";

let cached: Uint8Array | null = null;

/** 様式 PDF のバイト列を返す。用意できなければ null。 */
export async function loadOpeningNoticeFormTemplate(): Promise<Uint8Array | null> {
  if (cached) return cached;
  const envPath = process.env.ETAX_OPENING_FORM_PDF_PATH?.trim();
  const cachePath = join(serverDataDir(), "forms", TEMPLATE_FILE);
  const candidates = envPath ? [envPath, cachePath] : [cachePath];
  for (const path of candidates) {
    try {
      const bytes = await readFile(path);
      const normalized = normalizeFormTemplate(new Uint8Array(bytes));
      if (!normalized) continue;
      cached = normalized;
      return cached;
    } catch {
      // 次の候補へ
    }
  }
  try {
    const res = await fetch(TEMPLATE_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 100_000) return null;
    const normalized = normalizeFormTemplate(bytes);
    if (!normalized) return null;
    cached = normalized;
    try {
      await mkdir(join(serverDataDir(), "forms"), { recursive: true });
      await writeFile(cachePath, normalized);
    } catch {
      // キャッシュ保存に失敗しても生成は続ける
    }
    return cached;
  } catch {
    return null;
  }
}
