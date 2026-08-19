import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { settlePlayer } from "@/lib/game/settle";
import {
  getWorkJobView,
  listWorkplaceWorkers,
  startWork,
  stopWork,
} from "@/lib/game/work";

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("start"),
    buildingId: z.number().int().positive(),
  }),
  z.object({
    mode: z.literal("stop"),
  }),
  z.object({
    mode: z.literal("workers"),
    buildingId: z.number().int().positive(),
  }),
]);

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const playerId = Number(session.user.id);
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const db = getDb();
    await settlePlayer(db, playerId);

    if (parsed.data.mode === "workers") {
      const workers = await listWorkplaceWorkers(db, parsed.data.buildingId);
      return NextResponse.json({ workers });
    }

    if (parsed.data.mode === "stop") {
      await stopWork(db, playerId);
      const work = await getWorkJobView(db, playerId);
      return NextResponse.json({ ok: true, work });
    }

    const result = await startWork(db, playerId, parsed.data.buildingId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/work]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
