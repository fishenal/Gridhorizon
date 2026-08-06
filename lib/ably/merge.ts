import type { OnlinePlayer } from "@/components/game/OnlinePlayers";
import type { PresenceMember } from "@/lib/ably/channels";
import {
  normalizeBubble,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";

export type MapOther = {
  id: number;
  name: string;
  x: number;
  y: number;
  emoji?: string;
  bubble?: string;
  online?: boolean;
};

export function presenceToOnline(m: PresenceMember): OnlinePlayer {
  return {
    id: m.id,
    name: m.name,
    emoji: normalizePlayerEmoji(m.emoji),
    x: m.x,
    y: m.y,
    status: m.status || "idle",
  };
}

export function upsertOnlinePlayer(
  list: OnlinePlayer[],
  next: OnlinePlayer,
): OnlinePlayer[] {
  const i = list.findIndex((p) => p.id === next.id);
  if (i < 0) return [...list, next];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...next };
  return copy;
}

export function removeOnlinePlayer(
  list: OnlinePlayer[],
  id: number,
): OnlinePlayer[] {
  return list.filter((p) => p.id !== id);
}

export function upsertMapOther(
  players: MapOther[],
  next: MapOther,
  selfId: number,
  selfPos: { x: number; y: number },
  visionRadius: number,
): MapOther[] {
  if (next.id === selfId) return players;
  const dx = next.x - selfPos.x;
  const dy = next.y - selfPos.y;
  const inVision = dx * dx + dy * dy <= visionRadius * visionRadius;
  const without = players.filter((p) => p.id !== next.id);
  if (!inVision) return without;
  const prev = players.find((p) => p.id === next.id);
  return [
    ...without,
    {
      id: next.id,
      name: next.name,
      x: next.x,
      y: next.y,
      emoji: normalizePlayerEmoji(next.emoji),
      bubble:
        next.bubble !== undefined
          ? normalizeBubble(next.bubble)
          : (prev?.bubble ?? ""),
      online: next.online ?? true,
    },
  ];
}

export function patchMapOtherBubble(
  players: MapOther[],
  playerId: number,
  bubble: string,
): MapOther[] {
  const text = normalizeBubble(bubble);
  return players.map((p) =>
    p.id === playerId ? { ...p, bubble: text } : p,
  );
}

export function markMapOtherOffline(
  players: MapOther[],
  id: number,
): MapOther[] {
  return players.map((p) => (p.id === id ? { ...p, online: false } : p));
}

export function filterMapOthersByVision(
  players: MapOther[],
  selfId: number,
  selfPos: { x: number; y: number },
  visionRadius: number,
): MapOther[] {
  const r2 = visionRadius * visionRadius;
  return players.filter((p) => {
    if (p.id === selfId) return false;
    const dx = p.x - selfPos.x;
    const dy = p.y - selfPos.y;
    return dx * dx + dy * dy <= r2;
  });
}

/** Ably members win for live coords; HTTP fills offline ghosts in vision. */
export function mergeViewportPlayers(args: {
  ablyIds: Set<number>;
  ablyPlayers: MapOther[];
  httpPlayers: MapOther[];
  selfId: number;
  selfPos: { x: number; y: number };
  visionRadius: number;
}): MapOther[] {
  const { ablyIds, ablyPlayers, httpPlayers, selfId, selfPos, visionRadius } =
    args;
  const r2 = visionRadius * visionRadius;
  const byId = new Map<number, MapOther>();

  for (const p of ablyPlayers) {
    if (p.id === selfId) continue;
    if (!ablyIds.has(p.id)) continue;
    const dx = p.x - selfPos.x;
    const dy = p.y - selfPos.y;
    if (dx * dx + dy * dy > r2) continue;
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      emoji: normalizePlayerEmoji(p.emoji),
      bubble: normalizeBubble(p.bubble),
      online: true,
    });
  }

  for (const p of httpPlayers) {
    if (p.id === selfId || ablyIds.has(p.id) || byId.has(p.id)) continue;
    const dx = p.x - selfPos.x;
    const dy = p.y - selfPos.y;
    if (dx * dx + dy * dy > r2) continue;
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      emoji: normalizePlayerEmoji(p.emoji),
      bubble: normalizeBubble(p.bubble),
      online: false,
    });
  }

  return [...byId.values()];
}
