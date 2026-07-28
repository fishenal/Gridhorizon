/** Flag influence Chebyshev radius: 2 → 5×5 centered on the flag. */
export const FLAG_RANGE_RADIUS = 2;

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

/** Neutral tint for flag influence (no per-player colors). */
export const FLAG_RANGE_TINT = "#e879a9";

export function flagRangeHalf(): number {
  return FLAG_RANGE_RADIUS;
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
