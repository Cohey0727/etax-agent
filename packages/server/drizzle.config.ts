import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/repositories/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // 接続情報は環境変数から。認証情報を含む既定値は置かない
    // （未設定なら drizzle-kit が接続エラーで止まる）。
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/etaxagent",
  },
});
