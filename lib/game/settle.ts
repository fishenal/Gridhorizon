import type { Db } from "@/lib/db";
import { settleEconomy } from "@/lib/game/economy";
import { settleTravel } from "@/lib/game/travel";
import { autoFriendNearby } from "@/lib/game/social";

/** Idempotent on-read settlement for one player. */
export async function settlePlayer(db: Db, playerId: number): Promise<void> {
  await settleTravel(db, playerId);
  await settleEconomy(db, playerId);
  await autoFriendNearby(db, playerId);
}
