export const RESOURCE_EMOJI = {
  gold: "💰",
  stone: "🪨",
  wood: "🪵",
  food: "🍞",
  population: "👥",
  xp: "",
} as const;

export type ResourceId = keyof typeof RESOURCE_EMOJI;

export type ResourcePart = [ResourceId, number];

export const RESOURCE_LABEL: Record<ResourceId, string> = {
  gold: "Gold",
  stone: "Stone",
  wood: "Wood",
  food: "Food",
  population: "Population",
  xp: "XP",
};

export function formatAmount(id: ResourceId, amount: number): string {
  if (id === "xp") return `xp ${amount}`;
  return `${RESOURCE_EMOJI[id]} ${amount}`;
}

export function formatAmounts(
  parts: Array<ResourcePart>,
  sep = "  ",
  skipZero = true,
): string {
  return parts
    .filter(([, n]) => !skipZero || n !== 0)
    .map(([id, n]) => formatAmount(id, n))
    .join(sep);
}
