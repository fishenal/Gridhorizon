import type { Db } from "@/lib/db";
import { settleEconomy } from "@/lib/game/economy";
import { settleTravel } from "@/lib/game/travel";
import { settleWork } from "@/lib/game/work";
import { autoFriendNearby } from "@/lib/game/social";
import { ensureDefaultMap } from "@/lib/map/world";

/** Idempotent on-read settlement for one player. */
export async function settlePlayer(db: Db, playerId: number): Promise<void> {
  await ensureDefaultMap(db);
  await settleTravel(db, playerId);
  await settleWork(db, playerId);
  await settleEconomy(db, playerId);
  await autoFriendNearby(db, playerId);
}
