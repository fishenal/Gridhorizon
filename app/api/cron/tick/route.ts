import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { settleEconomyForAll } from "@/lib/game/economy";
import { travelJobs } from "@/lib/db/schema";
import { settleTravel } from "@/lib/game/travel";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const traveling = await db.select({ playerId: travelJobs.playerId }).from(travelJobs);
  for (const row of traveling) {
    await settleTravel(db, row.playerId);
  }
  const economyCount = await settleEconomyForAll(db);

  return NextResponse.json({
    ok: true,
    travelsSettled: traveling.length,
    economyPlayers: economyCount,
  });
}
