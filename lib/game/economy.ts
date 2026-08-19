import type { Db } from "@/lib/db";
import { players } from "@/lib/db/schema";

/**
 * Timed resource production is disabled — buildings grant resources on build.
 * Kept so settlePlayer / cron still have a no-op hook.
 */
export async function settleEconomy(_db: Db, _playerId: number): Promise<void> {
  return;
}

export async function settleEconomyForAll(db: Db): Promise<number> {
  const all = await db.select({ id: players.id }).from(players);
  return all.length;
}
