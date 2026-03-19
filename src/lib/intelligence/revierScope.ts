export type RevierOption = {
  id: string;
  name: string;
};

export type ResolvedRevierScope =
  | { type: "all"; revierId: null }
  | { type: "single"; revierId: string };

export function resolveRevierScope(
  rawRevier: string | undefined,
  allowedReviers: RevierOption[]
): ResolvedRevierScope {
  if (!rawRevier || rawRevier === "all") {
    return { type: "all", revierId: null };
  }

  const isAllowed = allowedReviers.some((revier) => revier.id === rawRevier);

  if (!isAllowed) {
    return { type: "all", revierId: null };
  }

  return { type: "single", revierId: rawRevier };
}