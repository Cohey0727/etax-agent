/**
 * atomicFile.ts — JSON 等の設定ファイルの原子的書き込み（lib）。
 *
 * 直接 writeFile すると、書き込み途中の失敗や並行書き込みでファイルが
 * 破損し、次回読み込みで全体が初期値に戻ってしまう（Issue #11）。
 * 一時ファイルへ書いてから rename することで、読者には常に
 * 完全な旧内容か完全な新内容のどちらかだけが見える。
 */
import { rename, writeFile } from "node:fs/promises";

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.tmp-${process.pid}`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, path);
}
