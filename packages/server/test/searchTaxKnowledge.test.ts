/**
 * searchTaxKnowledge.test.ts — 税務知識ベースの検索の検証。
 *
 * 同梱データを投入したテスト DB に対し、出典番号での指定（「2072」
 * 「No.2072」などの表記ゆれ）がその番号の文書を先頭に返すことを担保する。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { searchTaxKnowledge } from "../src/services/knowledge/searchTaxKnowledge";
import { seedTaxKnowledge } from "../src/services/knowledge/seedTaxKnowledge";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

beforeAll(async () => {
  await createTestDb();
  await seedTaxKnowledge();
});

describe("searchTaxKnowledge の出典番号", () => {
  test.each(["2072", "No.2072", "No2072", "no. 2072", "Ｎｏ．２０７２", "No.2072 青色申告"])(
    "%s で No.2072 が先頭に来る",
    async (query) => {
      const result = await searchTaxKnowledge(query, 5);
      expect(result.hits[0]?.number).toBe("2072");
    },
  );
});
