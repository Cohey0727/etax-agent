/**
 * formTemplateLoader.ts — 国税庁の公式様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 探索順: 環境変数で指定したパス → データフォルダ/forms 配下。無ければ
 * 国税庁サイトから取得してデータフォルダへキャッシュする。読み込んだ様式は
 * decryptPdfTemplate で pdf-lib が読める形に直し、プロセス内で使い回す。
 * 取得もできない場合は null を返し、呼び出し側が 503 で案内する。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../../lib/config";
import { normalizeFormTemplate } from "./decryptPdfTemplate";

export interface FormTemplateSource {
  /** データフォルダ/forms 配下のキャッシュファイル名。 */
  file: string;
  /** 国税庁サイトの様式 PDF の URL。 */
  url: string;
  /** 様式 PDF のパスを上書きする環境変数の名前。 */
  envVar: string;
}

/** 取得した様式 PDF として小さすぎる（エラーページ等）とみなすバイト数。 */
const MIN_TEMPLATE_BYTES = 100_000;

/** 様式 PDF のバイト列を返す読み込み関数を作る。用意できなければ null を返す。 */
export function createFormTemplateLoader(
  source: FormTemplateSource,
): () => Promise<Uint8Array | null> {
  let cached: Uint8Array | null = null;
  return async () => {
    if (cached) return cached;
    const envPath = process.env[source.envVar]?.trim();
    const cachePath = join(serverDataDir(), "forms", source.file);
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
      const res = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < MIN_TEMPLATE_BYTES) return null;
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
  };
}
