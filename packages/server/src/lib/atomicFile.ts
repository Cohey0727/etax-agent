/**
 * atomicFile.ts — JSON 等の設定ファイルの原子的書き込みと、同じファイルへの
 * 更新の直列化（lib）。
 *
 * 直接 writeFile すると、書き込み途中の失敗や並行書き込みでファイルが
 * 破損し、次回読み込みで全体が初期値に戻ってしまう。書き込みごとに別名の
 * 一時ファイルへ書いてから rename することで、読者には常に完全な旧内容か
 * 完全な新内容のどちらかだけが見える。
 */
import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, path);
  } catch (e) {
    await rm(tmpPath, { force: true });
    throw e;
  }
}

/** ファイルごとの実行待ちの末尾（失敗しても次の更新は続ける）。 */
const fileQueues = new Map<string, Promise<void>>();

/**
 * 同じファイルへの更新（読み→変更→書き）を、プロセス内で1つずつ順に実行する。
 * 並行に読んで書き戻すと、後から書いた側が他の更新を上書きして消すため。
 */
export function serializeFileUpdate<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = fileQueues.get(path) ?? Promise.resolve();
  const result = previous.then(task);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  fileQueues.set(path, tail);
  void tail.then(() => {
    if (fileQueues.get(path) === tail) fileQueues.delete(path);
  });
  return result;
}
