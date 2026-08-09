import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import {
  XP_BUILD,
  XP_PER_STEP,
  XP_PER_TOLL_GOLD,
} from "@/lib/map/constants";

export { XP_BUILD, XP_PER_STEP, XP_PER_TOLL_GOLD };

/** Monotonic participation XP (never decreases). */
export async function addXp(
  db: Db,
  playerId: number,
  amount: number,
): Promise<void> {
  const n = Math.floor(amount);
  if (n <= 0) return;
  await db
    .update(players)
    .set({ xp: sql`${players.xp} + ${n}` })
    .where(eq(players.id, playerId));
}

export function xpForSteps(steps: number): number {
  return Math.max(0, Math.floor(steps)) * XP_PER_STEP;
}

export function xpForToll(goldAmount: number): number {
  return Math.max(0, Math.floor(goldAmount)) * XP_PER_TOLL_GOLD;
}
