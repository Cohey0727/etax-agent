export const AppView = {
  Dashboard: "dashboard",
  Import: "import",
  Receipt: "receipt",
  Ledger: "ledger",
  Filing: "filing",
  Taxpayer: "taxpayer",
  Settings: "settings",
  Agent: "agent",
} as const;

export type AppView = (typeof AppView)[keyof typeof AppView];
