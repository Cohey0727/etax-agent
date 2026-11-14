import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/repositories/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://etax:etax@localhost:5432/etaxagent",
  },
});
