import { BreakdownEntry, DeductionPatch } from "@etax/shared";

/** エージェント由来の控除パッチの内訳に、保存用の id を補う。 */
export const withEntryIds = (patch: DeductionPatch): DeductionPatch => {
  if (!patch.entries) return patch;
  const entries: DeductionPatch["entries"] = {};
  for (const [key, list] of Object.entries(patch.entries)) {
    if (!list) continue;
    entries[key as keyof typeof entries] = list.map(
      (e, i): BreakdownEntry => ({
        id: e.id || `agent-${key}-${i}`,
        recipient: e.recipient ?? "",
        amount: typeof e.amount === "number" ? e.amount : 0,
      }),
    );
  }
  return { ...patch, entries };
};
