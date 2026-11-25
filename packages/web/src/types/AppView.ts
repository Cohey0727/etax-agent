export const AppView = {
  Dashboard: "dashboard",
  Import: "import",
  Receipt: "receipt",
  Ledger: "ledger",
  Reports: "reports",
  FixedAssets: "fixedAssets",
  Filing: "filing",
  Taxpayer: "taxpayer",
  Settings: "settings",
  Agent: "agent",
} as const;

export type AppView = (typeof AppView)[keyof typeof AppView];
