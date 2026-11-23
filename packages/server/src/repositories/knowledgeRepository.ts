/**
 * knowledgeRepository.ts — 税務知識ベース（knowledge_docs / knowledge_fts）への
 * データアクセス（repositories）。
 *
 * 全文検索は FTS5 の trigram インデックス（knowledge_fts、rowid = knowledge_docs.id）。
 * trigram は3文字未満の語を引けないため、短い語は LIKE 検索で補う。
 */
import { eq, sql } from "drizzle-orm";
import { Db } from "../lib/db";
import { KnowledgeDocRow, knowledgeDocsTable } from "./schema";

export interface KnowledgeDocInput {
  slug: string;
  number: string;
  title: string;
  category: string;
  sourceUrl: string;
  content: string;
}

/** 知識ドキュメントを slug で upsert する（同梱データの起動時シード用）。 */
export async function upsertKnowledgeDoc(db: Db, doc: KnowledgeDocInput): Promise<void> {
  await db
    .insert(knowledgeDocsTable)
    .values(doc)
    .onConflictDoUpdate({
      target: knowledgeDocsTable.slug,
      set: {
        number: doc.number,
        title: doc.title,
        category: doc.category,
        sourceUrl: doc.sourceUrl,
        content: doc.content,
        updatedAt: new Date(),
      },
    });
}

/** FTSインデックスを knowledge_docs の内容で作り直す（件数が小さいので全再構築で足りる）。 */
export function rebuildKnowledgeFts(db: Db): void {
  db.run(sql`DELETE FROM knowledge_fts`);
  db.run(sql`
    INSERT INTO knowledge_fts (rowid, title, content)
    SELECT id, title, content FROM knowledge_docs
  `);
}

/** 知識ドキュメントの件数を返す。 */
export async function countKnowledgeDocs(db: Db): Promise<number> {
  const rows = await db.select({ id: knowledgeDocsTable.id }).from(knowledgeDocsTable);
  return rows.length;
}

/** 出典番号が完全一致するドキュメントを返す（例: "2072"）。 */
export async function findKnowledgeDocByNumber(
  db: Db,
  number: string,
): Promise<KnowledgeDocRow | null> {
  const rows = await db
    .select()
    .from(knowledgeDocsTable)
    .where(eq(knowledgeDocsTable.number, number))
    .limit(1);
  return rows[0] ?? null;
}

export interface KnowledgeFtsHit extends KnowledgeDocRow {
  /** bm25 のスコア（小さいほど関連が強い）。 */
  rank: number;
}

/** FTS5（trigram）で検索する。matchQuery は呼び出し側で組み立てる。 */
export function searchKnowledgeFts(db: Db, matchQuery: string, limit: number): KnowledgeFtsHit[] {
  return db.all<KnowledgeFtsHit>(sql`
    SELECT d.*, bm25(knowledge_fts) AS rank
    FROM knowledge_fts
    JOIN knowledge_docs d ON d.id = knowledge_fts.rowid
    WHERE knowledge_fts MATCH ${matchQuery}
    ORDER BY rank
    LIMIT ${limit}
  `);
}

/** LIKE による部分一致検索（trigram で引けない2文字の語などの補完）。タイトル一致を先に並べる。 */
export function searchKnowledgeLike(db: Db, term: string, limit: number): KnowledgeDocRow[] {
  const pattern = `%${term}%`;
  return db.all<KnowledgeDocRow>(sql`
    SELECT * FROM knowledge_docs
    WHERE title LIKE ${pattern} OR content LIKE ${pattern}
    ORDER BY (CASE WHEN title LIKE ${pattern} THEN 0 ELSE 1 END), id
    LIMIT ${limit}
  `);
}
