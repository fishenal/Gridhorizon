import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { exploredChunks } from "@/lib/db/schema";
import { CHUNK_SIZE } from "./constants";
import { chunkCoords } from "./generator";
import { DEFAULT_MAP_ID } from "./world";

const BITS = CHUNK_SIZE * CHUNK_SIZE; // 1024
const BYTES = BITS / 8; // 128

export function emptyBitmap(): Uint8Array {
  return new Uint8Array(BYTES);
}

export function encodeBitmap(bits: Uint8Array): string {
  return Buffer.from(bits).toString("base64");
}

export function decodeBitmap(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  const out = emptyBitmap();
  out.set(buf.subarray(0, BYTES));
  return out;
}

function bitIndex(lx: number, ly: number): number {
  return ly * CHUNK_SIZE + lx;
}

export function getBit(bits: Uint8Array, lx: number, ly: number): boolean {
  const i = bitIndex(lx, ly);
  return (bits[i >> 3]! & (1 << (i & 7))) !== 0;
}

export function setBit(bits: Uint8Array, lx: number, ly: number): void {
  const i = bitIndex(lx, ly);
  bits[i >> 3]! |= 1 << (i & 7);
}

export function mergeBits(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = emptyBitmap();
  for (let i = 0; i < BYTES; i++) out[i] = a[i]! | b[i]!;
  return out;
}

const POPCOUNT8 = Uint8Array.from({ length: 256 }, (_, i) => {
  let n = 0;
  let v = i;
  while (v) {
    n += v & 1;
    v >>= 1;
  }
  return n;
});

export function countBitmapBits(bits: Uint8Array): number {
  let n = 0;
  const len = Math.min(bits.length, BYTES);
  for (let i = 0; i < len; i++) n += POPCOUNT8[bits[i]!]!;
  return n;
}

export function countEncodedBitmapBits(b64: string): number {
  return countBitmapBits(decodeBitmap(b64));
}

export async function countExploredCells(
  db: Db,
  playerId: number,
  mapId: number = DEFAULT_MAP_ID,
): Promise<number> {
  const rows = await db
    .select({ bitmap: exploredChunks.bitmap })
    .from(exploredChunks)
    .where(
      and(
        eq(exploredChunks.playerId, playerId),
        eq(exploredChunks.mapId, mapId),
      ),
    );
  let n = 0;
  for (const row of rows) n += countEncodedBitmapBits(row.bitmap);
  return n;
}

export async function countExploredCellsByPlayer(
  db: Db,
  playerIds: number[],
  mapId: number = DEFAULT_MAP_ID,
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (playerIds.length === 0) return counts;
  for (const id of playerIds) counts.set(id, 0);

  const rows = await db
    .select({
      playerId: exploredChunks.playerId,
      bitmap: exploredChunks.bitmap,
    })
    .from(exploredChunks)
    .where(
      and(
        eq(exploredChunks.mapId, mapId),
        inArray(exploredChunks.playerId, playerIds),
      ),
    );

  for (const row of rows) {
    counts.set(
      row.playerId,
      (counts.get(row.playerId) ?? 0) + countEncodedBitmapBits(row.bitmap),
    );
  }
  return counts;
}

export async function isExplored(
  db: Db,
  playerId: number,
  x: number,
  y: number,
  mapId: number = DEFAULT_MAP_ID,
): Promise<boolean> {
  const { cx, cy, lx, ly } = chunkCoords(x, y);
  const row = await db.query.exploredChunks.findFirst({
    where: and(
      eq(exploredChunks.playerId, playerId),
      eq(exploredChunks.mapId, mapId),
      eq(exploredChunks.chunkX, cx),
      eq(exploredChunks.chunkY, cy),
    ),
  });
  if (!row) return false;
  return getBit(decodeBitmap(row.bitmap), lx, ly);
}

export async function markExploredCells(
  db: Db,
  playerId: number,
  cells: Array<{ x: number; y: number }>,
  mapId: number = DEFAULT_MAP_ID,
): Promise<void> {
  if (cells.length === 0) return;

  const byChunk = new Map<
    string,
    { cx: number; cy: number; locals: Array<{ lx: number; ly: number }> }
  >();
  for (const { x, y } of cells) {
    const { cx, cy, lx, ly } = chunkCoords(x, y);
    const key = `${cx},${cy}`;
    let entry = byChunk.get(key);
    if (!entry) {
      entry = { cx, cy, locals: [] };
      byChunk.set(key, entry);
    }
    entry.locals.push({ lx, ly });
  }

  const chunkEntries = [...byChunk.values()];
  const existingRows =
    chunkEntries.length === 1
      ? await db
          .select()
          .from(exploredChunks)
          .where(
            and(
              eq(exploredChunks.playerId, playerId),
              eq(exploredChunks.mapId, mapId),
              eq(exploredChunks.chunkX, chunkEntries[0]!.cx),
              eq(exploredChunks.chunkY, chunkEntries[0]!.cy),
            ),
          )
      : await db
          .select()
          .from(exploredChunks)
          .where(
            and(
              eq(exploredChunks.playerId, playerId),
              eq(exploredChunks.mapId, mapId),
              or(
                ...chunkEntries.map(({ cx, cy }) =>
                  and(
                    eq(exploredChunks.chunkX, cx),
                    eq(exploredChunks.chunkY, cy),
                  ),
                ),
              ),
            ),
          );

  const existingByKey = new Map(
    existingRows.map((row) => [`${row.chunkX},${row.chunkY}`, row]),
  );

  const conflictTarget = [
    exploredChunks.playerId,
    exploredChunks.mapId,
    exploredChunks.chunkX,
    exploredChunks.chunkY,
  ] as const;

  await Promise.all(
    chunkEntries.map(({ cx, cy, locals }) => {
      const existing = existingByKey.get(`${cx},${cy}`);
      const bits = existing ? decodeBitmap(existing.bitmap) : emptyBitmap();
      for (const { lx, ly } of locals) setBit(bits, lx, ly);
      const bitmap = encodeBitmap(bits);
      return db
        .insert(exploredChunks)
        .values({ playerId, mapId, chunkX: cx, chunkY: cy, bitmap })
        .onConflictDoUpdate({
          target: [...conflictTarget],
          set: { bitmap },
        });
    }),
  );
}

/** Copy all explored chunks from source into target (union) on one map. */
export async function shareExploration(
  db: Db,
  fromPlayerId: number,
  toPlayerId: number,
  mapId: number = DEFAULT_MAP_ID,
): Promise<void> {
  const rows = await db.query.exploredChunks.findMany({
    where: and(
      eq(exploredChunks.playerId, fromPlayerId),
      eq(exploredChunks.mapId, mapId),
    ),
  });
  for (const row of rows) {
    const existing = await db.query.exploredChunks.findFirst({
      where: and(
        eq(exploredChunks.playerId, toPlayerId),
        eq(exploredChunks.mapId, mapId),
        eq(exploredChunks.chunkX, row.chunkX),
        eq(exploredChunks.chunkY, row.chunkY),
      ),
    });
    const merged = existing
      ? mergeBits(decodeBitmap(existing.bitmap), decodeBitmap(row.bitmap))
      : decodeBitmap(row.bitmap);
    const bitmap = encodeBitmap(merged);
    if (existing) {
      await db
        .update(exploredChunks)
        .set({ bitmap })
        .where(eq(exploredChunks.id, existing.id));
    } else {
      await db.insert(exploredChunks).values({
        playerId: toPlayerId,
        mapId,
        chunkX: row.chunkX,
        chunkY: row.chunkY,
        bitmap,
      });
    }
  }
}

export async function loadExploredSet(
  db: Db,
  playerId: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  mapId: number = DEFAULT_MAP_ID,
): Promise<Set<string>> {
  const minCx = Math.floor(minX / CHUNK_SIZE);
  const maxCx = Math.floor(maxX / CHUNK_SIZE);
  const minCy = Math.floor(minY / CHUNK_SIZE);
  const maxCy = Math.floor(maxY / CHUNK_SIZE);

  const rows = await db.query.exploredChunks.findMany({
    where: and(
      eq(exploredChunks.playerId, playerId),
      eq(exploredChunks.mapId, mapId),
    ),
  });

  const set = new Set<string>();
  for (const row of rows) {
    if (
      row.chunkX < minCx ||
      row.chunkX > maxCx ||
      row.chunkY < minCy ||
      row.chunkY > maxCy
    ) {
      continue;
    }
    const bits = decodeBitmap(row.bitmap);
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        if (!getBit(bits, lx, ly)) continue;
        const x = row.chunkX * CHUNK_SIZE + lx;
        const y = row.chunkY * CHUNK_SIZE + ly;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          set.add(`${x},${y}`);
        }
      }
    }
  }
  return set;
}
