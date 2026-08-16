import { hash } from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { players } from "@/lib/db/schema";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(24),
  password: z.string().min(4).max(72),
});

/** Upgrade the current session player: set lasting username + password. */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = Number(session?.user?.id);
    if (!session?.user || !Number.isFinite(userId) || userId <= 0) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { name, password } = parsed.data;
    const db = getDb();

    const me = await db.query.players.findFirst({
      where: eq(players.id, userId),
      columns: { id: true, name: true },
    });
    if (!me) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    if (name !== me.name) {
      const taken = await db.query.players.findFirst({
        where: and(eq(players.name, name), ne(players.id, userId)),
        columns: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "Name already taken" },
          { status: 409 },
        );
      }
    }

    const passwordHash = await hash(password, 10);
    const [updated] = await db
      .update(players)
      .set({ name, passwordHash })
      .where(eq(players.id, userId))
      .returning({ id: players.id, name: players.name });

    if (!updated) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: updated.id, name: updated.name });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server error (is DATABASE_URL set?)" },
      { status: 500 },
    );
  }
}
