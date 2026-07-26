import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  startDirectionalTravel,
  startTravel,
  stopTravel,
} from "@/lib/game/travel";

const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

const directionSchema = z.object({
  mode: z.literal("direction"),
  dx: z.number().int().min(-1).max(1),
  dy: z.number().int().min(-1).max(1),
  steps: z.number().int().min(1).max(500),
});

const stopSchema = z.object({
  mode: z.literal("stop"),
  x: z.number().int(),
  y: z.number().int(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json = await req.json();
    const db = getDb();
    const playerId = Number(session.user.id);

    const asStop = stopSchema.safeParse(json);
    if (asStop.success) {
      const result = await stopTravel(
        db,
        playerId,
        asStop.data.x,
        asStop.data.y,
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const asDirection = directionSchema.safeParse(json);
    if (asDirection.success) {
      const { dx, dy, steps } = asDirection.data;
      if (dx === 0 && dy === 0) {
        return NextResponse.json({ error: "Need a direction" }, { status: 400 });
      }
      const result = await startDirectionalTravel(db, playerId, dx, dy, steps);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const asPoint = pointSchema.safeParse(json);
    if (asPoint.success) {
      const result = await startTravel(
        db,
        playerId,
        asPoint.data.x,
        asPoint.data.y,
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  } catch (err) {
    console.error("[api/travel]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
