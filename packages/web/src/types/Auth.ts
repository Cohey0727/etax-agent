/**
 * Auth.ts — ログイン画面まわりの型。
 */

/** ログイン画面の表示モード。パスワード／登録／TOTP／マジックリンク／送信完了の5状態。 */
export type LoginMode = "login" | "register" | "totp" | "magic" | "magicSent" | "verifySent";
