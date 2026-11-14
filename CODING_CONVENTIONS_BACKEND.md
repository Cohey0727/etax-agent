# コーディング規約

## 概要

このドキュメントは、Cataris AIバックエンドプロジェクトにおけるコーディング規約を定めるものです。
一貫性のあるコードベースを維持し、チーム開発を円滑にするために、以下の規約に従ってください。

## 技術スタック

- **フレームワーク**: Hono 4
- **ランタイム**: Bun
- **言語**: TypeScript (Strict Mode)
- **ORM**: Prisma 7
- **バリデーション**: Zod (with @hono/zod-openapi)
- **データベース**: PostgreSQL 18

## プロジェクト構造

```
src/
├── constants/        # 定数（規約外レイヤー。新規追加しない）
├── generated/        # 自動生成ファイル（Prisma等）- 手動編集禁止
├── gateways/         # 外部サービス連携（AI API等）
├── lib/              # 共通ライブラリ（prisma, redis, llmClient等）
├── middlewares/      # Honoミドルウェア
├── repositories/     # データアクセス層（ストレージ等）
├── routes/           # ルート定義（usecasesを組み合わせる）
├── schemas/          # Zodスキーマ定義
├── services/         # 複数usecaseで共有するビジネスロジック。ドメインごとのサブディレクトリに置く（詳細は「7. Services」参照）
├── usecases/         # ビジネスロジック（Route + Handler）
├── utils/            # 汎用ユーティリティ（objectValuesと型ユーティリティのみ残存。新規追加はlib/へ）
└── index.ts          # エントリーポイント
```

## レイヤー構造と責務

### 1. Routes（ルート層）

ルートの登録とusecaseの組み合わせのみを行う。ビジネスロジックは含まない。

```ts
// ✅ 良い例
import { OpenAPIHono } from "@hono/zod-openapi";
import { createThreadRoute, createThreadHandler } from "../usecases/createThread";

const app = new OpenAPIHono<AuthContext>();
app.openapi(createThreadRoute, createThreadHandler);

export default app;
```

### 2. Usecases（ユースケース層）

1ファイルに1ユースケースを定義。ルート定義とハンドラをセットでエクスポート。

```ts
// usecases/createThread.ts
import { createRoute, type RouteHandler } from "@hono/zod-openapi";

export const createThreadRoute = createRoute({
  method: "post",
  path: "/",
  operationId: "createThread",
  tags: ["Threads"],
  summary: "新規スレッドを作成",
  request: { ... },
  responses: { ... },
});

export const createThreadHandler: RouteHandler<typeof createThreadRoute, AuthContext> = async (c) => {
  // ビジネスロジック
};
```

### 3. Schemas（スキーマ層）

Zodスキーマと型定義を管理。OpenAPI仕様も併せて定義。

```ts
// schemas/thread.ts
import { z } from "@hono/zod-openapi";

export const ThreadSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
  })
  .openapi("Thread");

export type ThreadResponse = z.infer<typeof ThreadSchema>;
```

### 4. Gateways（ゲートウェイ層）

外部サービス（AI API等）との連携を担当。

```ts
// gateways/generateTitle.ts
export const generateTitle = async (content: string): Promise<string> => {
  // 外部API呼び出し
};
```

#### 外部APIの呼び出し方

外部APIは次の順で呼び方を選ぶ。生のfetchを使ってよいのは、公式SDKもOpenAPIスキーマも無い外部APIだけ。

1. **公式SDKがあれば公式SDKを使う。** 再送・タイムアウトなどの既定値が合わなければ、そのクライアントのモジュールの中で1回上書きする。既定値が合わないことはSDKを避ける理由にしない。
2. **公式SDKが無くOpenAPIスキーマがあれば、orvalで生成したクライアントを使う。**
3. **どちらも無ければfetchで呼び、応答はzodで検証する。**

```ts
// ✅ 良い例（公式SDKを使い、既定値はクライアントのモジュールで上書きする）
const openRouter = new OpenRouter({ apiKey, retryConfig });
const response = await openRouter.systemOne.create(
  { decisionsRequest },
  { retryCodes: ["429", "5XX"] },
);

// ❌ 禁止（公式SDKがあるのに生fetchで呼ぶ）
const response = await fetch("https://openrouter.ai/api/v1/systemone", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(decisionsRequest),
});
```

**理由:**

- 型安全性が失われる
- APIの仕様との乖離が発生する
- リクエスト/レスポンスの型・再送・エラーの扱いを自前で持つことになる

### 5. Repositories（リポジトリ層）

データストレージ（GCS等）へのアクセスを担当。

```ts
// repositories/fileStorage.ts
export async function generateUploadSignedUrl(
  objectPath: string,
  contentType: string,
): Promise<{ url: string; expiresAt: Date }> {
  // ストレージ操作
}
```

### 6. Lib（ライブラリ層）

プロジェクト全体で使用する共通インスタンス。

```ts
// lib/prisma.ts
export const prisma = new PrismaClient({ adapter });
```

### 7. Services（サービス層）

複数の usecase から共有されるビジネスロジックを置く層（例: `services/external/externalApiKeys.ts`）。

配置はドメイン名のサブディレクトリ（`services/<domain>/`）配下とし、`services/` 直下には置かない。テストも同じ構造で `tests/services/<domain>/` に置く。

関数ベースのモジュール設計（plain function の named export + plain object）を基本とする。

クラスは用途で使い分ける:

- **型や情報の入れ物としては使わない。** データ形状は `type` / `interface` / union で表し、値は plain object で持つ。フィールドだけを持つクラス、あるいは型のためだけのクラスは作らない
- **関数と状態をカプセル化したものとしては使ってよい。** 一連の呼び出しにまたがって内部状態を持ち、その状態を操作するメソッドを束ねる対象（`lib/` の Redis ストリームマネージャなど）はクラスで書く
- `extends Error` のカスタム例外クラスは `instanceof` 判定のための慣用として使う

運用ルール:

- 共有ビジネスロジックは named export の関数として `services/<domain>/` に置く（例: `services/organizations/organizationUser.ts` / `services/external/externalApiKeys.ts`）
- 依存は引数（deps 注入）で受ける。関数・クラスのどちらでも DI コンテナは使わない

## ファイル命名規則

- **ファイル名**: camelCase（例: `createThread.ts`, `fileStorage.ts`）
- **1ファイル1責務**: 各ファイルは単一の目的を持つ
- **エクスポート名とファイル名の一致**: 主要なエクスポートはファイル名と一致させる

```
usecases/
├── createThread.ts     # createThreadRoute, createThreadHandler
├── listThreads.ts      # listThreadsRoute, listThreadsHandler
└── getThread.ts        # getThreadRoute, getThreadHandler
```

## TypeScript規約

### 1. 型定義

- **strictモード**: 必ず有効にする
- **any**: 使用禁止（どうしても必要な場合はunknownを使用）
- **型推論**: 可能な限り型推論を活用
- **import type**: 型のみの場合でも `import type` は使用しない
- **Object作成**: Spread演算子を使用し、必要な部分だけ上書きする

```ts
// ✅ 良い例
const updated = { ...original, nickname: "new" };

// ❌ 悪い例
const updated = {
  id: original.id,
  email: original.email,
  nickname: "new",
  // ... 全プロパティを列挙
};
```

```ts
// ✅ 良い例
import { AuthContext } from "../middlewares/auth";

// ❌ 悪い例
import type { AuthContext } from "../middlewares/auth";
```

### 2. 型のエクスポート

スキーマから推論された型を明示的にエクスポート。

```ts
export const ThreadSchema = z.object({ ... }).openapi("Thread");
export type ThreadResponse = z.infer<typeof ThreadSchema>;
```

### 3. 中身のないラッパー関数を作らない

**判定基準は「名前と本体のどちらが読み手に多くを伝えるか」。** 名前が本体より情報を持っていないなら、それは抽象化ではなく目隠しで、無いほうがよい。

```ts
// ❌ 悪い例: 名前からは上位ワードがどちらか分からない
makeU32FromTwoU16(a, b);

// ✅ 良い例: 式そのものが語順を語る
(a << 16) + b;
```

呼び出し元が多いことは、残す理由にはならない。読み手を迷わせる名前は、呼び出し元が多いほど曖昧さが広い範囲に伝播する。とくに悪いのは**受け取った引数を本体が使っていない関数**で、シグネチャが嘘をついている。

逆に、本体だけでは読めない規則を名前が述べているなら残す。`P2034` が何を指すかは本体を見ても分からないので、`isSerializationConflict` は名前のほうが情報を持っている。

**呼び出し先に何も足さない関数は定義しない。** 引数を素通しし、戻り値も素通しするだけの関数は、名前が 1 つ増えるぶん読み手が辿る距離を伸ばすだけで、抽象化にはなっていない。

次のどれかに当てはまるラッパーは、呼び出し先を直接呼ぶか、1 つの関数に統合する。

- 引数も戻り値も加工せず、呼び出し先へ委譲しているだけ
- 戻り値のプロパティを 1 つ取り出しているだけ（`envelope.source` を `sourceForEnvelope(envelope)` にする）
- 受け取った引数の一部を本体が使っていない
- 呼び出し元が 1 箇所しかない
- `undefined` を返す関数と、その直後で `undefined` を潰して throw する関数が対になっている

```ts
// ❌ 悪い例: 取得 → undefined を返す → 隣で throw に変換する、が 3 段に分かれている
export async function findAgentDefinition(name: string, ctx: RunContext) {
  return await FACTORIES.get(name)?.(ctx);
}

async function requireDefinition(name: string, ctx: RunContext) {
  const definition = await findAgentDefinition(name, ctx);
  if (!definition) throw new Error(`no agent definition is registered for '${name}'`);
  return definition;
}

// ✅ 良い例: 取得点で失敗を確定させ、1 関数に集約する
export async function buildAgentDefinition(name: string, ctx: RunContext) {
  const factory = FACTORIES.get(name);
  if (!factory) throw new Error(`no agent definition is registered for '${name}'`);
  return await factory(ctx);
}
```

`undefined` を返す関数を置いてよいのは、呼び出し元がその分岐を実際に使い分けるときだけ。全ての呼び出し元が throw するなら、`undefined` を返す層は要らない。

### 4. 数値として計算できる値に string 型を使わない（全面禁止）

**件数・金額・クレジット・割合など、計算・比較・集計できる値に `string` 型を使うことは全面禁止。例外は作らない。**
DB の列・API のスキーマ (リクエストもレスポンスも)・関数の引数と戻り値のどこでも数値で持つ。
DB は整数なら `Int`、小数なら `Decimal` (`@db.Decimal`) にし、小数の計算は `Prisma.Decimal` で行う。クエリパラメータのように文字列で届く値は、zod の `z.coerce.number()` で受け取った時点で数値にする。
桁区切りや丸めた表示用の文字列は backend では作らず、画面に出すところで作る。

理由: 一度文字列にすると、合計・差・並べ替え・比較のたびに数値へ戻す処理が要り、桁区切りや丸めで値も変わる。型で数値であることも守れなくなる。

```ts
// ❌ 悪い例: 小数を整形した文字列で返し、数値を文字列のまま受け取る
const CreditUsageSchema = z.object({ used: z.string() });
return c.json({ used: usage.used.toFixed(1) }, 200);
const QuerySchema = z.object({ months: z.string() }); // 使う側で Number(months)

// ✅ 良い例: 計算は Prisma.Decimal で行い、受け取りも返しも数値にする
const CreditUsageSchema = z.object({ used: z.number() });
return c.json({ used: usage.used.toNumber() }, 200);
const QuerySchema = z.object({ months: z.coerce.number().int() });
```

## Zodスキーマ規約

### 1. OpenAPI統合

すべてのスキーマに`.openapi()`を付与してドキュメント生成に対応。

```ts
// ✅ 良い例
export const ThreadSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
  })
  .openapi("Thread");

// ❌ 悪い例（OpenAPI名なし）
export const ThreadSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
});
```

### 2. スキーマの命名規則

- **エンティティ**: `{Entity}Schema`（例: `ThreadSchema`）
- **リクエスト**: `{Action}{Entity}RequestSchema`（例: `CreateThreadRequestSchema`）
- **レスポンス型**: `{Entity}Response`（例: `ThreadResponse`）
- **パスパラメータ**: `{Entity}IdParamSchema`（例: `ThreadIdParamSchema`）

### 3. 共通スキーマの定義

再利用可能なスキーマは同じファイル内で定義。

```ts
export const MessageContentSchema = z
  .object({
    type: z.enum(["markdown", "image", "file"]),
    content: z.string(),
  })
  .openapi("MessageContent");
```

## Honoルート規約

### 1. createRoute定義

必須フィールドを必ず含める。

```ts
export const createThreadRoute = createRoute({
  method: "post",           // HTTPメソッド
  path: "/",                // パス
  operationId: "createThread", // OpenAPI operationId（一意）
  tags: ["Threads"],          // OpenAPIタグ
  summary: "新規スレッドを作成", // 概要（日本語可）
  request: { ... },
  responses: { ... },
});
```

### 2. ハンドラ型定義

RouteHandlerに正確な型を指定。

```ts
export const createThreadHandler: RouteHandler<typeof createThreadRoute, AuthContext> = async (
  c,
) => {
  const user = c.get("user"); // 認証済みユーザー
  const body = c.req.valid("json"); // バリデーション済みボディ
  // ...
};
```

### 3. レスポンスの返却

型安全なレスポンスを返却。

```ts
// 型を明示してからc.json()に渡す
const response: ThreadResponse = {
  id: thread.id,
  title: thread.title,
};
return c.json(response, 201);
```

## 認証規約

### 1. AuthContextの使用

認証が必要なルートでは`AuthContext`を使用。

```ts
import { AuthContext } from "../middlewares/auth";

const app = new OpenAPIHono<AuthContext>();
```

### 2. ユーザー情報の取得

```ts
const user = c.get("user"); // AuthUser（sub, email, nickname）
const dbUser = c.get("dbUser"); // Prisma UserModel
```

## Prisma規約

### 1. インスタンスのインポート

```ts
import { prisma } from "../lib/prisma";
```

### 2. クエリパターン

```ts
// 作成
const thread = await prisma.thread.create({
  data: { userId: user.sub, title },
});

// 検索
const threads = await prisma.thread.findMany({
  where: { userId: user.sub },
  orderBy: { createdAt: "desc" },
});

// Upsert
const user = await prisma.user.upsert({
  where: { id: user.sub },
  update: { email },
  create: { id: user.sub, email },
});
```

## エラーハンドリング

### 1. HTTPExceptionの使用

```ts
import { HTTPException } from "hono/http-exception";

if (!resource) {
  throw new HTTPException(404, { message: "Resource not found" });
}
```

### 2. エラーレスポンススキーマ

```ts
export const ErrorSchema = z
  .object({
    message: z.string(),
  })
  .openapi("Error");
```

## 環境変数

### 1. 命名規則

環境変数はUPPER_SNAKE_CASEを使用。

```ts
const JWKS_URI = process.env.JWKS_URI;
const DATABASE_URL = process.env.DATABASE_URL;
```

### 2. 必須チェック

必須の環境変数は使用時に確認。

```ts
if (!JWKS_URI) {
  throw new HTTPException(500, { message: "JWKS_URI is not configured" });
}
```

## 定数の命名規則

### UPPER_SNAKE_CASEの使用

**UPPER_SNAKE_CASE は以下の場合に使用可。オブジェクトには使用禁止。**

- 環境変数名および環境変数から読み取った値
- モジュールスコープの純粋な定数（プリミティブ値）

**関数スコープ内の定数にはUPPER_SNAKE_CASEを使用しないこと。**

```ts
// ✅ 良い例: 環境変数（モジュールスコープ）
const JWKS_URI = process.env.JWKS_URI;
const REDIS_URL = process.env.REDIS_URL;

// ✅ 良い例: モジュールスコープのプリミティブな定数
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ❌ 悪い例: オブジェクトにUPPER_SNAKE_CASEを使用
const DEFAULT_CONFIG = { timeout: 5000, retries: 3 };

// ✅ 良い例: オブジェクトはcamelCaseまたはPascalCase
const defaultConfig = { timeout: 5000, retries: 3 };

// ❌ 悪い例: 関数スコープ内でUPPER_SNAKE_CASEを使用
function fetchData() {
  const MAX_RETRIES = 3;
  const BASE_URL = "/api";
}

// ✅ 良い例: 関数スコープ内はcamelCase
function fetchData() {
  const maxRetries = 3;
  const baseUrl = "/api";
}
```

## コメント規約

### 1. JSDoc

関数やエクスポートにはJSDocを使用。

```ts
/**
 * アップロード用の署名付きURLを生成する
 */
export async function generateUploadSignedUrl(
  objectPath: string,
  contentType: string,
): Promise<{ url: string; expiresAt: Date }> {
  // ...
}
```

### 2. 日本語コメント

コード内のコメントは日本語で記述可。

```ts
// 添付ファイルの所有権とアップロード状態を確認
const attachmentFiles = await validateOwnedUploadedAttachmentFiles({
  fileIds: body.fileIds,
  organizationId,
  userId,
});
```

## コード品質

### 1. Linting

コミット前に必ずlintを実行。

```bash
bun run lint
```

### 2. 型チェック

TypeScriptの型エラーはすべて解決してからコミット。

```bash
bun check -b
```

### 3. Prisma

スキーマ変更後は必ずコード生成。

```bash
bun run codegen
```

## まとめ

この規約に従うことで:

- コードの一貫性が保たれる
- チームメンバーがコードを理解しやすくなる
- OpenAPIドキュメントが自動生成される
- 型安全性が確保される

不明点や改良提案がある場合は、チームで議論して規約を更新してください。
