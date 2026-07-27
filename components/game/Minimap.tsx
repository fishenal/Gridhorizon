"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { MAP_SIZE } from "@/lib/map/constants";
import { generateTile } from "@/lib/map/generator";

const SIZE = 144;

const TERRAIN_RGB: Record<string, [number, number, number]> = {
  ocean: [61, 158, 201],
  plain: [107, 143, 78],
  mountain: [107, 91, 75],
  snow: [217, 228, 236],
  coast: [194, 164, 107],
};

type Props = {
  exploredRef: RefObject<Set<string>>;
  exploredRevision: number;
  seed: number;
  player: { x: number; y: number };
  viewCenter: { x: number; y: number };
  viewRadius: number;
};

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const BG = parseHex("#111111");

export function Minimap({
  exploredRef,
  exploredRevision,
  seed,
  player,
  viewCenter,
  viewRadius,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = ctx.createImageData(SIZE, SIZE);
    const data = img.data;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const o = i * 4;
      data[o] = BG[0];
      data[o + 1] = BG[1];
      data[o + 2] = BG[2];
      data[o + 3] = 255;
    }

    const explored = exploredRef.current;
    if (explored) {
      for (const key of explored) {
        const comma = key.indexOf(",");
        if (comma < 0) continue;
        const x = Number(key.slice(0, comma));
        const y = Number(key.slice(comma + 1));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const px = Math.floor((x / MAP_SIZE) * SIZE);
        const py = Math.floor((y / MAP_SIZE) * SIZE);
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        const tile = generateTile(x, y, seed);
        const rgb = TERRAIN_RGB[tile.terrain] ?? [68, 68, 68];
        const o = (py * SIZE + px) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    const toPx = (wx: number) => (wx / MAP_SIZE) * SIZE;
    const toPy = (wy: number) => (wy / MAP_SIZE) * SIZE;

    const left = toPx(viewCenter.x - viewRadius);
    const top = toPy(viewCenter.y - viewRadius);
    const side = ((viewRadius * 2 + 1) / MAP_SIZE) * SIZE;
    ctx.strokeStyle = "#ff2d9b";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, side, side);

    const px = toPx(player.x + 0.5);
    const py = toPy(player.y + 0.5);
    ctx.fillStyle = "#f5d76e";
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [
    exploredRef,
    exploredRevision,
    seed,
    player.x,
    player.y,
    viewCenter.x,
    viewCenter.y,
    viewRadius,
  ]);

  return (
    <div className="pointer-events-auto overflow-hidden rounded-lg border border-stone-200 bg-stone-900/90 shadow-md backdrop-blur">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="block"
        aria-label="探索缩略图"
      />
    </div>
  );
}
