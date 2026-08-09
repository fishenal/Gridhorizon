import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { normalizeBubble } from "@/lib/game/playerStyle";

const bodySchema = z.object({
  bubble: z.string().max(300),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bubble must be at most 300 characters" },
        { status: 400 },
      );
    }
    const bubble = normalizeBubble(parsed.data.bubble);
    const playerId = Number(session.user.id);
    const db = getDb();
    await db
      .update(players)
      .set({ bubble })
      .where(eq(players.id, playerId));
    return NextResponse.json({ ok: true, bubble });
  } catch (err) {
    console.error("[api/player/bubble]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
