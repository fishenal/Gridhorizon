"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ViewportTile =
  | { x: number; y: number; fog: true }
  | {
      x: number;
      y: number;
      fog: false;
      inVision: boolean;
      explored: boolean;
      isLand: boolean;
      terrain: string;
      resourceType: string;
      building: {
        id: number;
        type: string;
        ownerId: number;
        level: number;
        message: string | null;
      } | null;
      claim: { ownerId: number; askingPrice: number | null } | null;
    };

type Props = {
  tiles: ViewportTile[];
  center: { x: number; y: number };
  player: { x: number; y: number; id: number };
  others: Array<{ id: number; name: string; x: number; y: number }>;
  visionRadius: number;
  selected: { x: number; y: number } | null;
  onSelect: (x: number, y: number) => void;
};

const TERRAIN_COLOR: Record<string, string> = {
  ocean: "#1d4f6e",
  plain: "#6b8f4e",
  mountain: "#6b5b4b",
  snow: "#d9e4ec",
  coast: "#c2a46b",
};

export function MapCanvas({
  tiles,
  center,
  player,
  others,
  visionRadius,
  selected,
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = visionRadius * 2 + 1;
  const cell = 14;
  const dim = size * cell;

  const tileMap = useMemo(() => {
    const m = new Map<string, ViewportTile>();
    for (const t of tiles) m.set(`${t.x},${t.y}`, t);
    return m;
  }, [tiles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, dim, dim);

    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        const wx = center.x - visionRadius + gx;
        const wy = center.y - visionRadius + gy;
        const t = tileMap.get(`${wx},${wy}`);
        const px = gx * cell;
        const py = gy * cell;

        if (!t || t.fog) {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(px, py, cell, cell);
          continue;
        }

        ctx.fillStyle = TERRAIN_COLOR[t.terrain] ?? "#444";
        ctx.fillRect(px, py, cell, cell);

        if (!t.inVision) {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(px, py, cell, cell);
        }

        if (t.resourceType !== "none") {
          ctx.fillStyle = "#f5d76e";
          ctx.fillRect(px + 4, py + 4, 6, 6);
        }

        if (t.building) {
          const colors: Record<string, string> = {
            mine: "#b85c38",
            farm: "#8fbc5a",
            fishery: "#4a90a4",
            town: "#c45c26",
            waypoint: "#e8e8e8",
          };
          ctx.fillStyle = colors[t.building.type] ?? "#fff";
          ctx.beginPath();
          ctx.arc(px + cell / 2, py + cell / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (t.claim) {
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
        }
      }
    }

    // others
    for (const o of others) {
      const gx = o.x - center.x + visionRadius;
      const gy = o.y - center.y + visionRadius;
      if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
      ctx.fillStyle = "#f0a0a0";
      ctx.fillRect(gx * cell + 3, gy * cell + 3, cell - 6, cell - 6);
    }

    // player
    {
      const gx = player.x - center.x + visionRadius;
      const gy = player.y - center.y + visionRadius;
      if (gx >= 0 && gy >= 0 && gx < size && gy < size) {
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.arc(
          gx * cell + cell / 2,
          gy * cell + cell / 2,
          5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.strokeStyle = "#111";
        ctx.stroke();
      }
    }

    if (selected) {
      const gx = selected.x - center.x + visionRadius;
      const gy = selected.y - center.y + visionRadius;
      if (gx >= 0 && gy >= 0 && gx < size && gy < size) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(gx * cell + 1, gy * cell + 1, cell - 2, cell - 2);
        ctx.lineWidth = 1;
      }
    }
  }, [
    tileMap,
    center,
    player,
    others,
    selected,
    size,
    dim,
    visionRadius,
    cell,
  ]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const gx = Math.floor((e.clientX - rect.left) / cell);
    const gy = Math.floor((e.clientY - rect.top) / cell);
    const wx = center.x - visionRadius + gx;
    const wy = center.y - visionRadius + gy;
    onSelect(wx, wy);
  }

  return (
    <canvas
      ref={canvasRef}
      width={dim}
      height={dim}
      onClick={onClick}
      className="cursor-crosshair rounded border border-stone-700 shadow-lg"
      style={{ imageRendering: "pixelated", maxWidth: "100%" }}
    />
  );
}
