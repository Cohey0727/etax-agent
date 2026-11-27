/**
 * dataDirIsolation.test.ts — テスト実行中のデータフォルダが、実運用の
 * packages/server/data ではなく一時フォルダを指していることを確かめる。
 * 学習履歴などは所有者 1 だと接尾辞なしの実運用ファイル名に書かれるため、
 * ここが崩れるとテストのデータが実運用の履歴に混ざる。
 */
import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { serverDataDir } from "../src/lib/config";
import { settingsFilePath } from "../src/repositories/settingsFiles";

const productionDataDir = resolve(join(import.meta.dir, "../data"));

describe("テストのデータフォルダ", () => {
  test("一時フォルダの下を指し、実運用の data を指さない", () => {
    const dir = resolve(serverDataDir());
    expect(dir).not.toBe(productionDataDir);
    expect(dir.startsWith(resolve(tmpdir()) + sep)).toBe(true);
  });

  test("既定ユーザーの学習履歴も実運用の data の外に書かれる", () => {
    const path = resolve(settingsFilePath("classification-history.json", 1));
    expect(path.startsWith(productionDataDir + sep)).toBe(false);
  });
});
