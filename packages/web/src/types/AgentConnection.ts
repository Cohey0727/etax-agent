/**
 * 設定画面「外部接続」から入れる AI 接続の上書き。
 * 空文字の項目はサーバー側の設定（環境変数）を使う。
 * APIキーはこの端末（ブラウザ）にだけ保存され、チャット送信時にのみサーバーへ送る。
 */
export interface AgentConnectionConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}
