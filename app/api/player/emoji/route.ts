import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";
import {
  AVATAR_EMOJI_CHOICES,
  isAllowedAvatarEmoji,
} from "@/lib/game/playerStyle";

const bodySchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success || !isAllowedAvatarEmoji(parsed.data.emoji)) {
      return NextResponse.json(
        { error: "Invalid emoji", choices: AVATAR_EMOJI_CHOICES },
        { status: 400 },
      );
    }
    const playerId = Number(session.user.id);
    const db = getDb();
    await db
      .update(players)
      .set({ emoji: parsed.data.emoji.trim() })
      .where(eq(players.id, playerId));
    return NextResponse.json({ ok: true, emoji: parsed.data.emoji.trim() });
  } catch (err) {
    console.error("[api/player/emoji]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
