/**
 * userRepository.ts — ユーザー・セッション・APIキーの読み書き（repositories）。
 * トークンと API キーは平文を保存せず SHA-256 ハッシュで照合する。
 */
import { createHash, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Db } from "../lib/db";
import {
  ApiKeyRow,
  UserRow,
  apiKeysTable,
  sessionsTable,
  usersTable,
} from "./schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** メールアドレスでユーザーを引く。 */
export async function getUserByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  return row;
}

/** ユーザーを作る。パスワードは Bun.password（argon2id）でハッシュ化する。 */
export async function createUser(db: Db, email: string, password: string): Promise<UserRow> {
  const passwordHash = await Bun.password.hash(password);
  const [row] = await db
    .insert(usersTable)
    .values({ email, passwordHash })
    .returning();
  return row;
}

/** パスワードを照合する。 */
export async function verifyUserPassword(user: UserRow, password: string): Promise<boolean> {
  return Bun.password.verify(password, user.passwordHash);
}

/** セッションを発行し、平文トークンを返す（DBにはハッシュだけを保存）。 */
export async function createSession(db: Db, userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

/** セッショントークンからユーザーIDを解決する。期限切れ・不明は undefined。 */
export async function resolveSessionUserId(db: Db, token: string): Promise<number | undefined> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashToken(token)));
  if (!row || row.expiresAt.getTime() < Date.now()) return undefined;
  return row.userId;
}

/** セッションを破棄する（ログアウト）。 */
export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashToken(token)));
}

/** API キーを発行し、平文キーを返す（DBにはハッシュと接頭辞だけを保存）。 */
export async function createApiKey(
  db: Db,
  userId: number,
  name: string,
): Promise<{ row: ApiKeyRow; key: string }> {
  const key = `etax_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeysTable)
    .values({ userId, name, keyHash: hashToken(key), keyPrefix: key.slice(0, 10) })
    .returning();
  return { row, key };
}

/** API キーからユーザーIDを解決する。最終利用日時も更新する。 */
export async function resolveApiKeyUserId(db: Db, key: string): Promise<number | undefined> {
  const [row] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, hashToken(key)));
  if (!row) return undefined;
  await db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, row.id));
  return row.userId;
}

/** ユーザーの API キー一覧（平文は含まない）。 */
export async function listApiKeyRows(db: Db, userId: number): Promise<ApiKeyRow[]> {
  return db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId))
    .orderBy(desc(apiKeysTable.id));
}

/** API キーを削除する（本人のものだけ）。 */
export async function deleteApiKeyRow(db: Db, userId: number, id: number): Promise<boolean> {
  const [row] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id));
  if (!row || row.userId !== userId) return false;
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  return true;
}
