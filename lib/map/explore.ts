import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { exploredChunks } from "@/lib/db/schema";
import { CHUNK_SIZE } from "./constants";
import { chunkCoords } from "./generator";

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
  for (let i = 0; i < BYTES; i++) out[i] = (a[i]! | b[i]!);
  return out;
}

export async function isExplored(
  db: Db,
  playerId: number,
  x: number,
  y: number,
): Promise<boolean> {
  const { cx, cy, lx, ly } = chunkCoords(x, y);
  const row = await db.query.exploredChunks.findFirst({
    where: and(
      eq(exploredChunks.playerId, playerId),
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
): Promise<void> {
  if (cells.length === 0) return;

  const byChunk = new Map<string, { cx: number; cy: number; locals: Array<{ lx: number; ly: number }> }>();
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

  for (const { cx, cy, locals } of byChunk.values()) {
    const existing = await db.query.exploredChunks.findFirst({
      where: and(
        eq(exploredChunks.playerId, playerId),
        eq(exploredChunks.chunkX, cx),
        eq(exploredChunks.chunkY, cy),
      ),
    });
    const bits = existing ? decodeBitmap(existing.bitmap) : emptyBitmap();
    for (const { lx, ly } of locals) setBit(bits, lx, ly);
    const bitmap = encodeBitmap(bits);
    if (existing) {
      await db
        .update(exploredChunks)
        .set({ bitmap })
        .where(eq(exploredChunks.id, existing.id));
    } else {
      await db.insert(exploredChunks).values({
        playerId,
        chunkX: cx,
        chunkY: cy,
        bitmap,
      });
    }
  }
}

/** Copy all explored chunks from source into target (union). */
export async function shareExploration(
  db: Db,
  fromPlayerId: number,
  toPlayerId: number,
): Promise<void> {
  const rows = await db.query.exploredChunks.findMany({
    where: eq(exploredChunks.playerId, fromPlayerId),
  });
  for (const row of rows) {
    const existing = await db.query.exploredChunks.findFirst({
      where: and(
        eq(exploredChunks.playerId, toPlayerId),
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
): Promise<Set<string>> {
  const minCx = Math.floor(minX / CHUNK_SIZE);
  const maxCx = Math.floor(maxX / CHUNK_SIZE);
  const minCy = Math.floor(minY / CHUNK_SIZE);
  const maxCy = Math.floor(maxY / CHUNK_SIZE);

  const rows = await db.query.exploredChunks.findMany({
    where: eq(exploredChunks.playerId, playerId),
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
