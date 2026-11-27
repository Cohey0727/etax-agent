/**
 * ensureTables.test.ts — 起動時のテーブル初期化が多重に走らないことの検証。
 *
 * 起動処理と初回リクエストの待機が同時に初期化を呼んでも、DDL は1回だけ
 * 流れる（並行した CREATE … IF NOT EXISTS は一意制約違反で失敗しうるため）。
 * 初期化済みかどうかはモジュールの状態なので、未初期化の状態から試すために
 * モジュールを別インスタンスとして読み込む。
 */
import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { Pool } from "pg";

const previousDatabaseUrl = process.env.DATABASE_URL;

afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("ensureTables", () => {
  test("同時に呼んでも DDL は1回だけ流れ、どちらの呼び出しも成功する", async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
    const fresh = (await import(`../src/lib/db.ts?instance=${Date.now()}`)) as typeof import(
      "../src/lib/db"
    );
    const query = spyOn(Pool.prototype, "query");
    try {
      await Promise.all([fresh.ensureTables(), fresh.ensureTables(), fresh.tablesReady()]);
      const extensionStatements = query.mock.calls.filter((call) =>
        JSON.stringify(call[0]).includes("CREATE EXTENSION IF NOT EXISTS pg_trgm"),
      );
      expect(extensionStatements).toHaveLength(1);
    } finally {
      query.mockRestore();
    }
  });
});
