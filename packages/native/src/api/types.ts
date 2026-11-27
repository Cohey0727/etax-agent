/**
 * types.ts — サーバーAPIのワイヤ形式（snake_case）の型。Web と共通の型は
 * @etax/shared/apiWire にあり、ここでは native だけが使う名前を足す。
 */
export * from "@etax/shared/apiWire";

/** 資格情報として渡すテキスト（パスワードやAPIキー）の型。 */
export type CredentialText = string;
