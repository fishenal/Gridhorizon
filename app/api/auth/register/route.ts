import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import {
  INITIAL_FOOD,
  INITIAL_GOLD,
  MAP_CENTER,
} from "@/lib/map/constants";
import { markExploredCells } from "@/lib/map/explore";
import { VISION_RADIUS } from "@/lib/map/constants";
import { DEFAULT_MAP_ID, ensureDefaultMap } from "@/lib/map/world";
import { DEFAULT_PLAYER_EMOJI } from "@/lib/game/playerStyle";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(24),
  password: z.string().min(4).max(72),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { name, password } = parsed.data;
    const db = getDb();
    await ensureDefaultMap(db);

    const existing = await db.query.players.findFirst({
      where: eq(players.name, name),
    });
    if (existing) {
      return NextResponse.json(
        { error: "Name already taken" },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 10);
    const [created] = await db
      .insert(players)
      .values({
        name,
        passwordHash,
        currentMapId: DEFAULT_MAP_ID,
        x: MAP_CENTER,
        y: MAP_CENTER,
        gold: INITIAL_GOLD,
        food: INITIAL_FOOD,
        emoji: DEFAULT_PLAYER_EMOJI,
      })
      .returning();

    if (!created) {
      return NextResponse.json({ error: "Create failed" }, { status: 500 });
    }

    const cells: Array<{ x: number; y: number }> = [];
    const r2 = VISION_RADIUS * VISION_RADIUS;
    for (let dy = -VISION_RADIUS; dy <= VISION_RADIUS; dy++) {
      for (let dx = -VISION_RADIUS; dx <= VISION_RADIUS; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        cells.push({ x: MAP_CENTER + dx, y: MAP_CENTER + dy });
      }
    }
    await markExploredCells(db, created.id, cells, DEFAULT_MAP_ID);

    return NextResponse.json({ ok: true, id: created.id, name: created.name });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server error (is DATABASE_URL set?)" },
      { status: 500 },
    );
  }
}
