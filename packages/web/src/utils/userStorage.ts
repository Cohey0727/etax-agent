/**
 * userStorage.ts — localStorage のユーザー分離（utils）。
 *
 * 端末保存（会話・控除入力キャッシュ・納税者情報の移行元）は、ブラウザを
 * 共有する別アカウントの値を読み書きすると、hydrate の自動 PUT で
 * 他人の DB を汚染してしまう（Issue #9）。そのため、ログイン中の
 * ユーザーIDでキーを名前空間化する。ユーザー未確定（認証オフの
 * ローカル運用）では従来のキー名のまま使う（単一ユーザー前提）。
 */

let currentUserId: number | null = null;

/** ログイン中のユーザーIDを設定する（ログアウト時は null）。 */
export const setStorageUserId = (userId: number | null): void => {
  currentUserId = userId;
};

/** 現在のストレージ用ユーザーID。 */
export const storageUserId = (): number | null => currentUserId;

/** ベースキーを現在のユーザーの名前空間へ寄せる。 */
export const userScopedKey = (baseKey: string): string =>
  currentUserId === null ? baseKey : `${baseKey}:u${currentUserId}`;

/**
 * 現在のユーザーの名前空間キーをすべて消す（ログアウト時）。
 * 次に別アカウントが同じブラウザで開いても、前のユーザーの
 * キャッシュが読まれたりサーバーへ移行されたりしないようにする。
 */
export const clearCurrentUserStorage = (): void => {
  if (currentUserId === null) return;
  const suffix = `:u${currentUserId}`;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.endsWith(suffix)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // 消せない環境ではそのまま（次回ログイン時の名前空間で分離は効く）
  }
};
