/**
 * Structure influence: user-facing 10×10 zone.
 * Chebyshev radius 5 → cells with max(|dx|,|dy|) <= 5 (11×11 grid cells;
 * labeled 10×10 as the design size).
 */
export const FLAG_RANGE_RADIUS = 5;

/** User-facing influence size. */
export const STRUCTURE_INFLUENCE_SIDE = 10;

export const DEFAULT_PLAYER_EMOJI = "🙂";

/** Shown when the player stands on water. */
export const SEA_TRAVEL_EMOJI = "⛵";

/** Allowed avatar choices for players. */
export const AVATAR_EMOJI_CHOICES = [
  "🙂",
  "😎",
  "🧙",
  "🧑‍🚀",
  "🐱",
  "🦊",
  "🐻",
  "🐸",
  "🤖",
  "👻",
  "🥷",
  "🧝",
] as const;

export type AvatarEmoji = (typeof AVATAR_EMOJI_CHOICES)[number];

const BUILDING_EMOJI: Record<string, string> = {
  flag: "🚩",
  waypoint: "🚩",
  town: "🏘️",
  mine: "⛏️",
  farm: "🌾",
  fishery: "🎣",
};

/** Neutral tint for structure influence overlay (hover only). */
export const FLAG_RANGE_TINT = "#e879a9";

export function influenceSide(_radius: number = FLAG_RANGE_RADIUS): number {
  return STRUCTURE_INFLUENCE_SIDE;
}

export function buildingEmoji(type: string): string {
  return BUILDING_EMOJI[type] ?? "◆";
}

export function normalizePlayerEmoji(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PLAYER_EMOJI;
  const trimmed = raw.trim();
  if ((AVATAR_EMOJI_CHOICES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }
  // Allow previously saved single-grapheme emoji outside the picker
  if (trimmed.length > 0 && trimmed.length <= 8) return trimmed;
  return DEFAULT_PLAYER_EMOJI;
}

export function displayUnitEmoji(
  avatarEmoji: string | null | undefined,
  terrain: string | undefined,
): string {
  if (terrain === "water" || terrain === "ocean") return SEA_TRAVEL_EMOJI;
  return normalizePlayerEmoji(avatarEmoji);
}

export function isAllowedAvatarEmoji(raw: string): boolean {
  return (AVATAR_EMOJI_CHOICES as readonly string[]).includes(raw.trim());
}
