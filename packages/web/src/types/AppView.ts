export const AppView = {
  Dashboard: "dashboard",
  Import: "import",
  Receipt: "receipt",
  Ledger: "ledger",
  Reports: "reports",
  CashFlow: "cashFlow",
  FixedAssets: "fixedAssets",
  Invoices: "invoices",
  Filing: "filing",
  Taxpayer: "taxpayer",
  Settings: "settings",
  McpSettings: "mcpSettings",
  Agent: "agent",
} as const;

export type AppView = (typeof AppView)[keyof typeof AppView];
