/**
 * seedTaxKnowledge.ts — 同梱の税務知識データ（taxKnowledgeData）を DB へ流し込む
 * （services/knowledge）。サーバー起動時に ensureTables の後で呼ぶ。
 *
 * 件数が小さい（100件未満）ため、毎回 upsert + FTS 全再構築で冪等に保つ。
 */
import { getDb } from "../../lib/db";
import {
  countKnowledgeDocs,
  rebuildKnowledgeFts,
  upsertKnowledgeDoc,
} from "../../repositories/knowledgeRepository";
import { TAX_KNOWLEDGE_DOCS } from "./taxKnowledgeData";

/** 同梱データを knowledge_docs へ upsert し、FTSインデックスを作り直す。件数を返す。 */
export async function seedTaxKnowledge(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  for (const doc of TAX_KNOWLEDGE_DOCS) {
    await upsertKnowledgeDoc(db, {
      slug: `nta-${doc.number}`,
      number: doc.number,
      title: doc.title,
      category: doc.category,
      sourceUrl: doc.sourceUrl,
      content: doc.content,
    });
  }
  rebuildKnowledgeFts(db);
  return countKnowledgeDocs(db);
}
