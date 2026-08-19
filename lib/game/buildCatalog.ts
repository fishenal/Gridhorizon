import {
  FARM_COST,
  FLAG_COST,
  LUMBER_COST,
  MINE_COST,
  PRODUCER_GRANT,
  TOWN_COST,
  TOWN_MAT_COST,
  TOWN_POP_GRANT,
} from "@/lib/map/constants";
import { buildingEmoji } from "@/lib/game/playerStyle";
import { formatAmounts } from "@/lib/game/resources";

export type BuildKind = "flag" | "town" | "mine" | "farm" | "lumber";

export type Wallet = {
  gold: number;
  stone: number;
  wood: number;
  food: number;
  population: number;
};

export type ResourceBag = Partial<Wallet>;

export type BuildCatalogEntry = {
  id: BuildKind;
  label: string;
  icon: string;
  cost: ResourceBag;
  grant: ResourceBag;
  costLabel: string;
  needsName: boolean;
};

function costLabel(cost: ResourceBag): string {
  return formatAmounts([
    ["gold", cost.gold ?? 0],
    ["stone", cost.stone ?? 0],
    ["wood", cost.wood ?? 0],
    ["food", cost.food ?? 0],
  ]);
}

export const BUILD_CATALOG: readonly BuildCatalogEntry[] = [
  {
    id: "flag",
    label: "Flag",
    icon: buildingEmoji("flag"),
    cost: { gold: FLAG_COST },
    grant: {},
    costLabel: costLabel({ gold: FLAG_COST }),
    needsName: true,
  },
  {
    id: "mine",
    label: "Quarry",
    icon: buildingEmoji("mine"),
    cost: { gold: MINE_COST },
    grant: { stone: PRODUCER_GRANT },
    costLabel: costLabel({ gold: MINE_COST }),
    needsName: false,
  },
  {
    id: "farm",
    label: "Farm",
    icon: buildingEmoji("farm"),
    cost: { gold: FARM_COST },
    grant: { food: PRODUCER_GRANT },
    costLabel: costLabel({ gold: FARM_COST }),
    needsName: false,
  },
  {
    id: "lumber",
    label: "Lumber",
    icon: buildingEmoji("lumber"),
    cost: { gold: LUMBER_COST },
    grant: { wood: PRODUCER_GRANT },
    costLabel: costLabel({ gold: LUMBER_COST }),
    needsName: false,
  },
  {
    id: "town",
    label: "Town",
    icon: buildingEmoji("town"),
    cost: {
      gold: TOWN_COST,
      stone: TOWN_MAT_COST,
      wood: TOWN_MAT_COST,
      food: TOWN_MAT_COST,
    },
    grant: { population: TOWN_POP_GRANT },
    costLabel: costLabel({
      gold: TOWN_COST,
      stone: TOWN_MAT_COST,
      wood: TOWN_MAT_COST,
      food: TOWN_MAT_COST,
    }),
    needsName: true,
  },
] as const;

export type BuildAvailabilityContext = Wallet & {
  isLand: boolean;
  occupied: boolean;
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

export function goldCostForBuild(id: BuildKind): number {
  return getBuildEntry(id).cost.gold ?? 0;
}

export function applyBuildWallet(
  wallet: Wallet,
  kind: BuildKind,
): Wallet {
  const { cost, grant } = getBuildEntry(kind);
  return {
    gold: wallet.gold - (cost.gold ?? 0) + (grant.gold ?? 0),
    stone: wallet.stone - (cost.stone ?? 0) + (grant.stone ?? 0),
    wood: wallet.wood - (cost.wood ?? 0) + (grant.wood ?? 0),
    food: wallet.food - (cost.food ?? 0) + (grant.food ?? 0),
    population:
      wallet.population - (cost.population ?? 0) + (grant.population ?? 0),
  };
}

/** Client-side gate mirroring /api/build rules (server remains authoritative). */
export function getBuildAvailability(
  id: BuildKind,
  ctx: BuildAvailabilityContext,
): BuildAvailability {
  if (ctx.occupied) {
    return { ok: false, reason: "This tile already has a building" };
  }

  if (id !== "flag" && !ctx.isLand) {
    return { ok: false, reason: "Need land" };
  }

  const { cost } = getBuildEntry(id);
  if (ctx.gold < (cost.gold ?? 0)) {
    return { ok: false, reason: `Need ${formatAmounts([["gold", cost.gold ?? 0]])}` };
  }
  if (ctx.stone < (cost.stone ?? 0)) {
    return {
      ok: false,
      reason: `Need ${formatAmounts([["stone", cost.stone ?? 0]])}`,
    };
  }
  if (ctx.wood < (cost.wood ?? 0)) {
    return {
      ok: false,
      reason: `Need ${formatAmounts([["wood", cost.wood ?? 0]])}`,
    };
  }
  if (ctx.food < (cost.food ?? 0)) {
    return {
      ok: false,
      reason: `Need ${formatAmounts([["food", cost.food ?? 0]])}`,
    };
  }

  return { ok: true, reason: null };
}
