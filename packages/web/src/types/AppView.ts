export const AppView = {
  Dashboard: "dashboard",
  Import: "import",
  Receipt: "receipt",
  Amend: "amend",
  Ledger: "ledger",
  Settings: "settings",
  Agent: "agent",
} as const;

export type AppView = (typeof AppView)[keyof typeof AppView];
