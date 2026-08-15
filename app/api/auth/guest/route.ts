import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import {
  INITIAL_FOOD,
  INITIAL_GOLD,
  MAP_CENTER,
  VISION_RADIUS,
} from "@/lib/map/constants";
import { markExploredCells } from "@/lib/map/explore";
import { DEFAULT_MAP_ID, ensureDefaultMap } from "@/lib/map/world";
import { DEFAULT_PLAYER_EMOJI } from "@/lib/game/playerStyle";

function randomGuestName(): string {
  return `Traveler-${randomBytes(3).toString("hex")}`;
}

function randomGuestToken(): string {
  return randomBytes(24).toString("base64url");
}

async function createGuestPlayer() {
  const db = getDb();
  await ensureDefaultMap(db);

  for (let attempt = 0; attempt < 8; attempt++) {
    const name = randomGuestName();
    const token = randomGuestToken();
    const passwordHash = await hash(token, 10);

    try {
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

      if (!created) continue;

      const cells: Array<{ x: number; y: number }> = [];
      const r2 = VISION_RADIUS * VISION_RADIUS;
      for (let dy = -VISION_RADIUS; dy <= VISION_RADIUS; dy++) {
        for (let dx = -VISION_RADIUS; dx <= VISION_RADIUS; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          cells.push({ x: MAP_CENTER + dx, y: MAP_CENTER + dy });
        }
      }
      await markExploredCells(db, created.id, cells, DEFAULT_MAP_ID);

      return { id: created.id, name: created.name, token };
    } catch {
      // Unique name collision — retry with a new name.
    }
  }

  return null;
}

/** Create a guest traveler; client stores { name, token } and signs in. */
export async function POST() {
  try {
    const guest = await createGuestPlayer();
    if (!guest) {
      return NextResponse.json(
        { error: "Could not create guest" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      id: guest.id,
      name: guest.name,
      token: guest.token,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server error (is DATABASE_URL set?)" },
      { status: 500 },
    );
  }
}
