/**
 * userRepository.ts — ユーザー・セッション・APIキーの読み書き（repositories）。
 * トークンと API キーは平文を保存せず SHA-256 ハッシュで照合する。
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { Db } from "../lib/db";
import { decryptField, encryptField } from "../lib/encryption";
import {
  ApiKeyRow,
  UserRow,
  apiKeysTable,
  emailVerificationTokensTable,
  magicLinkTokensTable,
  sessionsTable,
  userIdentitiesTable,
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

/**
 * ユーザーを作る。パスワードは Bun.password（argon2id）でハッシュ化する。
 * emailVerified は呼び出し側が決める: パスワード登録はメール所有を
 * 証明していないため、SaaS 運用では確認メールを経るまで false を渡す。
 * それ以外の経路（ローカル運用など）は従来どおり true。
 */
export async function createUser(
  db: Db,
  email: string,
  password: string,
  emailVerified: boolean = true,
): Promise<UserRow> {
  const passwordHash = await Bun.password.hash(password);
  const [row] = await db
    .insert(usersTable)
    .values({ email, passwordHash, emailVerified })
    .returning();
  return row;
}

/** パスワードを照合する。パスワード未設定（OAuth等のみ）のユーザーは常に false。 */
export async function verifyUserPassword(user: UserRow, password: string): Promise<boolean> {
  if (!user.passwordHash) return false;
  return Bun.password.verify(password, user.passwordHash);
}

/**
 * パスワードなしのユーザーを作る（マジックリンク・OAuth 用）。
 * どちらの経路もメールボックス/プロバイダ側で所有確認が済んでいるため
 * emailVerified は true で作る。
 */
export async function createPasswordlessUser(db: Db, email: string): Promise<UserRow> {
  const [row] = await db
    .insert(usersTable)
    .values({ email, passwordHash: "", emailVerified: true })
    .returning();
  return row;
}

/** メール確認済みに更新する。 */
export async function markEmailVerified(db: Db, userId: number): Promise<void> {
  await db.update(usersTable).set({ emailVerified: true }).where(eq(usersTable.id, userId));
}

/**
 * パスワード資格情報を消去する（パスワードなしユーザーにする）。
 * 未確認のパスワード登録アカウントをメールボックス所有者が引き継ぐときに
 * 使う: 先行登録した第三者のパスワードを残すと乗っ取りになるため。
 */
export async function clearUserPassword(db: Db, userId: number): Promise<void> {
  await db.update(usersTable).set({ passwordHash: "" }).where(eq(usersTable.id, userId));
}

/** TOTP 秘密を保存する（保存時暗号化）。有効化は別途 setUserTotpEnabled で行う。 */
export async function setUserTotpSecret(db: Db, userId: number, secretBase32: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ totpSecret: encryptField(secretBase32) })
    .where(eq(usersTable.id, userId));
}

/** 保存済みの TOTP 秘密を復号して返す。未設定は null。 */
export function readUserTotpSecret(user: UserRow): string | null {
  if (!user.totpSecret) return null;
  try {
    return decryptField(user.totpSecret);
  } catch {
    return null;
  }
}

/** TOTP の有効・無効を切り替える。無効化では秘密も消す。 */
export async function setUserTotpEnabled(db: Db, userId: number, enabled: boolean): Promise<void> {
  await db
    .update(usersTable)
    .set(enabled ? { totpEnabled: true } : { totpEnabled: false, totpSecret: "" })
    .where(eq(usersTable.id, userId));
}

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

/** マジックリンク用トークンを発行し、平文を返す（DBにはハッシュだけを保存）。 */
export async function createMagicLinkToken(db: Db, email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(magicLinkTokensTable).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  return token;
}

/**
 * マジックリンク用トークンを消費し、メールアドレスを返す。
 * 不明・期限切れ・使用済みは undefined。消費は1回限り。
 * usedAt が NULL の行だけを更新し、実際に更新できた場合だけ成功とする
 * （並行した二重消費で片方が0行更新になっても成功扱いにしない TOCTOU 対策）。
 */
export async function consumeMagicLinkToken(
  db: Db,
  token: string,
): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(magicLinkTokensTable)
    .where(eq(magicLinkTokensTable.tokenHash, hashToken(token)));
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return undefined;
  const updated = await db
    .update(magicLinkTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(magicLinkTokensTable.id, row.id), isNull(magicLinkTokensTable.usedAt)))
    .returning();
  if (updated.length !== 1) return undefined;
  return row.email;
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** 登録時のメール確認用トークンを発行し、平文を返す（DBにはハッシュだけを保存）。 */
export async function createEmailVerificationToken(db: Db, userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(emailVerificationTokensTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });
  return token;
}

/**
 * メール確認用トークンを消費し、ユーザーIDを返す。
 * 不明・期限切れ・使用済みは undefined。消費は1回限り（原子的に判定）。
 */
export async function consumeEmailVerificationToken(
  db: Db,
  token: string,
): Promise<number | undefined> {
  const [row] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.tokenHash, hashToken(token)));
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return undefined;
  const updated = await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(eq(emailVerificationTokensTable.id, row.id), isNull(emailVerificationTokensTable.usedAt)),
    )
    .returning();
  if (updated.length !== 1) return undefined;
  return row.userId;
}

/**
 * OAuth の外部IDからユーザーを引く。無ければメールで既存ユーザーを引き、
 * それも無ければ新規ユーザーを作って外部IDを結び付ける。
 */
export async function findOrCreateOAuthUser(
  db: Db,
  provider: string,
  providerUserId: string,
  email: string,
): Promise<UserRow> {
  const [identity] = await db
    .select()
    .from(userIdentitiesTable)
    .where(
      and(
        eq(userIdentitiesTable.provider, provider),
        eq(userIdentitiesTable.providerUserId, providerUserId),
      ),
    );
  if (identity) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, identity.userId));
    if (user) return user;
  }
  const existing = await getUserByEmail(db, email);
  if (existing && !existing.emailVerified && existing.passwordHash) {
    // Pre-Account Takeover 対策: メール未確認のままパスワード登録された
    // アカウントに OAuth を統合すると、先行登録者のパスワードが残って
    // 乗っ取られる。メールボックス所有者（この OAuth ログインの本人）が
    // 引き継ぐ形にし、未確認の資格情報は引き継がない。
    await clearUserPassword(db, existing.id);
    await markEmailVerified(db, existing.id);
    existing.passwordHash = "";
    existing.emailVerified = true;
  }
  const user = existing ?? (await createPasswordlessUser(db, email));
  if (!identity) {
    await db
      .insert(userIdentitiesTable)
      .values({ userId: user.id, provider, providerUserId })
      .onConflictDoNothing();
  }
  return user;
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

/**
 * 期限切れのセッションと各種トークンを削除する（Issue #11: 定期掃除）。
 * 放置するとテーブルが単調に増え続けるため、起動時と定期実行で呼ぶ。
 * 削除した件数を返す。
 */
export async function deleteExpiredAuthRows(db: Db, now: Date = new Date()): Promise<number> {
  let deleted = 0;
  const sessions = await db
    .delete(sessionsTable)
    .where(lt(sessionsTable.expiresAt, now))
    .returning({ id: sessionsTable.id });
  deleted += sessions.length;
  const magic = await db
    .delete(magicLinkTokensTable)
    .where(lt(magicLinkTokensTable.expiresAt, now))
    .returning({ id: magicLinkTokensTable.id });
  deleted += magic.length;
  const verification = await db
    .delete(emailVerificationTokensTable)
    .where(lt(emailVerificationTokensTable.expiresAt, now))
    .returning({ id: emailVerificationTokensTable.id });
  deleted += verification.length;
  return deleted;
}
