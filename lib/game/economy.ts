import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { buildings, players, type Building } from "@/lib/db/schema";
import {
  ECONOMY_CYCLE_SECONDS,
  FARM_BASE_FOOD,
  FISHERY_BASE_FOOD,
  MINE_GOLD_RATES,
  TOWN_BASE_GOLD,
  TOWN_CONSUME_PER_TILE,
} from "@/lib/map/constants";
import { generateTile } from "@/lib/map/generator";
import { getPlayerWorld } from "@/lib/map/world";

function clusterSize(
  buildingsOfType: Building[],
  start: Building,
): number {
  const key = (b: Building) => `${b.mapId},${b.x},${b.y}`;
  const set = new Set(buildingsOfType.map(key));
  const visited = new Set<string>();
  const stack = [start];
  let count = 0;
  while (stack.length) {
    const cur = stack.pop()!;
    const k = key(cur);
    if (visited.has(k)) continue;
    visited.add(k);
    count++;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nk = `${cur.mapId},${cur.x + dx},${cur.y + dy}`;
      if (set.has(nk) && !visited.has(nk)) {
        const next = buildingsOfType.find((b) => key(b) === nk);
        if (next) stack.push(next);
      }
    }
  }
  return count;
}

/** Town gold for cluster size n: n=1 → 2, n=2 → 5, else 2n + (n-1) */
function townClusterGold(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return TOWN_BASE_GOLD;
  if (n === 2) return 5;
  return TOWN_BASE_GOLD * n + (n - 1);
}

export async function settleEconomy(db: Db, playerId: number): Promise<void> {
  const player = await db.query.players.findFirst({
    where: eq(players.id, playerId),
  });
  if (!player) return;

  const now = Date.now();
  const last = new Date(player.economySettledAt).getTime();
  const cycles = Math.floor((now - last) / (ECONOMY_CYCLE_SECONDS * 1000));
  if (cycles <= 0) return;

  const world = await getPlayerWorld(db, playerId);
  const mapId = world.id;

  const owned = await db.query.buildings.findMany({
    where: and(
      eq(buildings.ownerId, playerId),
      eq(buildings.mapId, mapId),
    ),
  });

  let gold = player.gold;
  let stone = player.stone;
  let wood = player.wood;
  let ore = player.ore;
  let food = player.food;

  const farms = owned.filter((b) => b.type === "farm");
  const towns = owned.filter((b) => b.type === "town");
  const mines = owned.filter((b) => b.type === "mine");
  const fisheries = owned.filter((b) => b.type === "fishery");

  for (let c = 0; c < cycles; c++) {
    // Mines → gold from resource type
    for (const m of mines) {
      const tile = generateTile(m.x, m.y, world.seed);
      if (tile.resourceType === "none") continue;
      gold += MINE_GOLD_RATES[tile.resourceType];
    }

    // Farms → food with adjacency bonus
    for (const f of farms) {
      const n = clusterSize(farms, f);
      const mult = 1 + 0.1 * (n - 1);
      food += Math.floor(FARM_BASE_FOOD * mult);
    }

    // Fisheries
    for (const _ of fisheries) {
      food += FISHERY_BASE_FOOD;
    }

    // Towns: consume then produce (per-tile accounting via clusters once)
    const townVisited = new Set<string>();
    for (const t of towns) {
      const k = `${t.x},${t.y}`;
      if (townVisited.has(k)) continue;
      const n = clusterSize(towns, t);
      // mark cluster
      const stack = [t];
      const cluster: Building[] = [];
      while (stack.length) {
        const cur = stack.pop()!;
        const ck = `${cur.x},${cur.y}`;
        if (townVisited.has(ck)) continue;
        townVisited.add(ck);
        cluster.push(cur);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const next = towns.find(
            (b) => b.x === cur.x + dx && b.y === cur.y + dy,
          );
          if (next && !townVisited.has(`${next.x},${next.y}`)) stack.push(next);
        }
      }

      const needStone = TOWN_CONSUME_PER_TILE.stone * n;
      const needWood = TOWN_CONSUME_PER_TILE.wood * n;
      const needOre = TOWN_CONSUME_PER_TILE.ore * n;
      const needFood = TOWN_CONSUME_PER_TILE.food * n;
      if (
        stone >= needStone &&
        wood >= needWood &&
        ore >= needOre &&
        food >= needFood
      ) {
        stone -= needStone;
        wood -= needWood;
        ore -= needOre;
        food -= needFood;
        gold += townClusterGold(n);
      }
    }
  }

  const settledAt = new Date(
    last + cycles * ECONOMY_CYCLE_SECONDS * 1000,
  );

  await db
    .update(players)
    .set({
      gold,
      stone,
      wood,
      ore,
      food,
      economySettledAt: settledAt,
    })
    .where(eq(players.id, playerId));
}

export async function settleEconomyForAll(db: Db): Promise<number> {
  const all = await db.select({ id: players.id }).from(players);
  for (const p of all) {
    await settleEconomy(db, p.id);
  }
  return all.length;
}

export async function getOwnedBuildingAt(
  db: Db,
  x: number,
  y: number,
  mapId: number,
): Promise<Building | undefined> {
  return db.query.buildings.findFirst({
    where: and(
      eq(buildings.mapId, mapId),
      eq(buildings.x, x),
      eq(buildings.y, y),
    ),
  });
}
