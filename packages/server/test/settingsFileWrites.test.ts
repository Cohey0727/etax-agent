/**
 * settingsFileWrites.test.ts — 設定・学習履歴の JSON ファイルへの並行書き込みの検証。
 *
 * - writeFileAtomic を同じファイルへ並行に呼んでも、失敗せず、本体が
 *   常にどちらかの完全な内容になること。
 * - 学習履歴の記録（読み→変更→書き）を並行に呼んでも、全件が残ること。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "../src/lib/atomicFile";
import {
  loadClassificationHistory,
  recordClassification,
} from "../src/repositories/classificationHistoryRepository";

const previousDataDir = process.env.ETAX_DATA_DIR;
let dataDir = "";

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "etax-settings-writes-"));
  process.env.ETAX_DATA_DIR = dataDir;
});

afterAll(async () => {
  if (previousDataDir === undefined) delete process.env.ETAX_DATA_DIR;
  else process.env.ETAX_DATA_DIR = previousDataDir;
  await rm(dataDir, { recursive: true, force: true });
});

describe("設定ファイルの並行書き込み", () => {
  test("writeFileAtomic を同じファイルへ並行に呼んでも失敗せず、内容が混ざらない", async () => {
    const path = join(dataDir, "atomic.json");
    const long = JSON.stringify({
      rules: Array.from({ length: 2000 }, (_, i) => ({ pattern: `p${i}`, category: "c" })),
    });
    const short = JSON.stringify({ rules: [] });
    for (let round = 0; round < 50; round++) {
      const results = await Promise.allSettled([
        writeFileAtomic(path, long),
        writeFileAtomic(path, short),
      ]);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      const text = await readFile(path, "utf-8");
      expect([long, short]).toContain(text);
    }
  });

  test("学習履歴の記録を並行に呼んでも全件が残る", async () => {
    const count = 20;
    const results = await Promise.allSettled(
      Array.from({ length: count }, (_, i) => recordClassification(`並行摘要${i}`, "消耗品費")),
    );
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const history = await loadClassificationHistory();
    expect(history.filter((record) => record.description.startsWith("並行摘要"))).toHaveLength(
      count,
    );
  });
});
