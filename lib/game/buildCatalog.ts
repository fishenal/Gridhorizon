import { FLAG_COST, MINE_COST } from "@/lib/map/constants";
import { buildingEmoji } from "@/lib/game/playerStyle";
import { STRUCTURE_TOO_CLOSE_MSG } from "@/lib/game/structureSpacing";
import type { ResourceType, Terrain } from "@/lib/map/generator";

export type BuildKind = "flag" | "town" | "mine" | "farm" | "fishery";

export type BuildCatalogEntry = {
  id: BuildKind;
  label: string;
  icon: string;
  /** Shown under the icon when available (cost / hint). */
  costLabel: string | null;
  needsName: boolean;
  /** Uses flag/town 20×20 spacing rule. */
  spaced: boolean;
};

export const BUILD_CATALOG: readonly BuildCatalogEntry[] = [
  {
    id: "flag",
    label: "Flag",
    icon: buildingEmoji("flag"),
    costLabel: `${FLAG_COST}g`,
    needsName: true,
    spaced: true,
  },
  {
    id: "town",
    label: "Town",
    icon: buildingEmoji("town"),
    costLabel: null,
    needsName: true,
    spaced: true,
  },
  {
    id: "mine",
    label: "Mine",
    icon: buildingEmoji("mine"),
    costLabel: `${MINE_COST}g`,
    needsName: false,
    spaced: false,
  },
  {
    id: "farm",
    label: "Farm",
    icon: buildingEmoji("farm"),
    costLabel: null,
    needsName: false,
    spaced: false,
  },
  {
    id: "fishery",
    label: "Fishery",
    icon: buildingEmoji("fishery"),
    costLabel: null,
    needsName: false,
    spaced: false,
  },
] as const;

export type BuildAvailabilityContext = {
  terrain: Terrain | undefined;
  isLand: boolean;
  resourceType: ResourceType;
  occupied: boolean;
  tooCloseToStructure: boolean;
  gold: number;
  /** Own claim on this tile (required for mine/farm/fishery). */
  claimedBySelf: boolean;
  /** Adjacent water — beach / lakeside for fishery. */
  shore: boolean;
};

export type BuildAvailability = {
  ok: boolean;
  reason: string | null;
};

export function getBuildEntry(id: BuildKind): BuildCatalogEntry {
  const entry = BUILD_CATALOG.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown build kind: ${id}`);
  return entry;
}

export function buildNeedsName(id: BuildKind): boolean {
  return getBuildEntry(id).needsName;
}

/** Client-side gate mirroring /api/build rules (server remains authoritative). */
export function getBuildAvailability(
  id: BuildKind,
  ctx: BuildAvailabilityContext,
): BuildAvailability {
  if (ctx.occupied) {
    return { ok: false, reason: "This tile already has a building" };
  }

  switch (id) {
    case "flag": {
      // Server allows flags on any tile (including water); only spacing + gold.
      if (ctx.tooCloseToStructure) {
        return { ok: false, reason: STRUCTURE_TOO_CLOSE_MSG };
      }
      if (ctx.gold < FLAG_COST) {
        return { ok: false, reason: `Need ${FLAG_COST} gold` };
      }
      return { ok: true, reason: null };
    }
    case "town": {
      if (ctx.terrain !== "grass") {
        return { ok: false, reason: "Towns need grassland" };
      }
      if (ctx.tooCloseToStructure) {
        return { ok: false, reason: STRUCTURE_TOO_CLOSE_MSG };
      }
      return { ok: true, reason: null };
    }
    case "mine": {
      if (!ctx.isLand) return { ok: false, reason: "Need land" };
      if (!ctx.claimedBySelf) {
        return { ok: false, reason: "Claim the tile first" };
      }
      if (ctx.resourceType === "none") {
        return { ok: false, reason: "No resource here" };
      }
      if (ctx.gold < MINE_COST) {
        return { ok: false, reason: `Need ${MINE_COST} gold` };
      }
      return { ok: true, reason: null };
    }
    case "farm": {
      if (!ctx.isLand) return { ok: false, reason: "Need land" };
      if (!ctx.claimedBySelf) {
        return { ok: false, reason: "Claim the tile first" };
      }
      if (ctx.terrain !== "grass") {
        return { ok: false, reason: "Farms need grassland" };
      }
      if (ctx.resourceType !== "none") {
        return { ok: false, reason: "Resource tiles use mines" };
      }
      return { ok: true, reason: null };
    }
    case "fishery": {
      if (!ctx.isLand) return { ok: false, reason: "Need land" };
      if (!ctx.claimedBySelf) {
        return { ok: false, reason: "Claim the tile first" };
      }
      if (ctx.terrain !== "desert" || !ctx.shore) {
        return { ok: false, reason: "Fisheries need beach / lakeside sand" };
      }
      return { ok: true, reason: null };
    }
    default:
      return { ok: false, reason: "Unknown building" };
  }
}
