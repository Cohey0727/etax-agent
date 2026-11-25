/**
 * knowledgeRepository.ts — 税務知識ベース（knowledge_docs）への
 * データアクセス（repositories）。
 *
 * 部分一致検索は pg_trgm の GIN インデックス（title / content）で
 * 高速化した ILIKE で行う。trigram インデックスは3文字未満の語を
 * 引けないため、短い語も同じ ILIKE 検索（逐次スキャン）で補う。
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

export interface KnowledgeSearchHit extends KnowledgeDocRow {
  /** 並び順のキー（0 = タイトル一致、1 = 本文のみ一致。小さいほど関連が強い）。 */
  rank: number;
}

/**
 * 生SQLの結果行を KnowledgeDocRow の形（camelCase）にそろえるための列リスト。
 * raw クエリはドライバの列名（snake_case）がそのまま返るため、明示的に alias する。
 */
const docColumns = sql`id, slug, number, title, category, source_url AS "sourceUrl", content, updated_at AS "updatedAt"`;

/**
 * ILIKE のパターン用に検索語をエスケープする。検索語に含まれる
 * % / _ / \ がワイルドカードとして効いてしまうのを防ぐ
 * （PostgreSQL の ILIKE の既定エスケープはバックスラッシュ）。
 */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * trigram インデックスを使った部分一致検索（3文字以上の語向け）。
 * タイトル一致を優先し、本文中の出現位置が早いものを上位にする。
 */
export async function searchKnowledgeTrgm(
  db: Db,
  term: string,
  limit: number,
): Promise<KnowledgeSearchHit[]> {
  const pattern = `%${escapeLikeTerm(term)}%`;
  const result = await db.execute(sql`
    SELECT ${docColumns}, (CASE WHEN title ILIKE ${pattern} THEN 0 ELSE 1 END) AS rank
    FROM knowledge_docs
    WHERE title ILIKE ${pattern} OR content ILIKE ${pattern}
    ORDER BY rank, COALESCE(NULLIF(strpos(content, ${term}), 0), 2147483647), id
    LIMIT ${limit}
  `);
  return result.rows as unknown as KnowledgeSearchHit[];
}

/** ILIKE による部分一致検索（trigram で引けない2文字の語などの補完）。タイトル一致を先に並べる。 */
export async function searchKnowledgeLike(
  db: Db,
  term: string,
  limit: number,
): Promise<KnowledgeDocRow[]> {
  const pattern = `%${escapeLikeTerm(term)}%`;
  const result = await db.execute(sql`
    SELECT ${docColumns}
    FROM knowledge_docs
    WHERE title ILIKE ${pattern} OR content ILIKE ${pattern}
    ORDER BY (CASE WHEN title ILIKE ${pattern} THEN 0 ELSE 1 END), id
    LIMIT ${limit}
  `);
  return result.rows as unknown as KnowledgeDocRow[];
}
