export const AppView = {
  Dashboard: "dashboard",
  Import: "import",
  Amend: "amend",
  Agent: "agent",
} as const;

export type AppView = (typeof AppView)[keyof typeof AppView];
