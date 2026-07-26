"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

export type MapPlayer = { id: number; name: string; x: number; y: number };

export type SelectedEntity = {
  type: "player";
  id: number;
  name: string;
  x: number;
  y: number;
};

export type ScreenPoint = { x: number; y: number };

export type MapClickPayload = {
  x: number;
  y: number;
  entity: SelectedEntity | null;
};

export type ScreenAnchors = {
  tile: ScreenPoint | null;
  entity: ScreenPoint | null;
  cellSize: number;
};

type Props = {
  tiles: ViewportTile[];
  center: { x: number; y: number };
  player: MapPlayer;
  others: MapPlayer[];
  visionRadius: number;
  selectedTile: { x: number; y: number } | null;
  selectedEntityId: number | null;
  onMapClick: (payload: MapClickPayload) => void;
  onAnchorsChange: (anchors: ScreenAnchors) => void;
};

const TERRAIN_COLOR: Record<string, string> = {
  ocean: "#3d9ec9",
  plain: "#6b8f4e",
  mountain: "#6b5b4b",
  snow: "#d9e4ec",
  coast: "#c2a46b",
};

const AXIS_LEFT = 52;
const AXIS_TOP = 32;
const LABEL_STEP = 10;

function drawPlayerAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  highlight: boolean,
) {
  ctx.fillStyle = "#f5d76e";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = highlight ? "#ff2d9b" : "#1a1a1a";
  ctx.lineWidth = highlight ? Math.max(2, r * 0.18) : Math.max(1, r * 0.08);
  ctx.stroke();

  const eyeY = cy - r * 0.15;
  const eyeR = Math.max(1.2, r * 0.1);
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, eyeY, eyeR, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.28, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = Math.max(1.2, r * 0.1);
  ctx.arc(cx, cy + r * 0.1, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

export function MapCanvas({
  tiles,
  center,
  player,
  others,
  visionRadius,
  selectedTile,
  selectedEntityId,
  onMapClick,
  onAnchorsChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 640, h: 480 });

  const gridSize = visionRadius * 2 + 1;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setBox({
        w: Math.max(120, Math.floor(cr.width)),
        h: Math.max(120, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell = Math.max(
    4,
    Math.floor(
      Math.min((box.w - AXIS_LEFT) / gridSize, (box.h - AXIS_TOP) / gridSize),
    ),
  );
  const mapW = gridSize * cell;
  const mapH = gridSize * cell;
  const canvasW = AXIS_LEFT + mapW;
  const canvasH = AXIS_TOP + mapH;
  const avatarR = Math.max(7, cell * 0.55);
  const otherR = Math.max(3, cell * 0.32);

  const tileMap = useMemo(() => {
    const m = new Map<string, ViewportTile>();
    for (const t of tiles) m.set(`${t.x},${t.y}`, t);
    return m;
  }, [tiles]);

  const allUnits = useMemo(() => {
    const list: MapPlayer[] = [
      { id: player.id, name: player.name, x: player.x, y: player.y },
      ...others,
    ];
    return list;
  }, [player.id, player.name, player.x, player.y, others]);

  function worldToWrap(wx: number, wy: number): ScreenPoint | null {
    const cx = Number(center.x);
    const cy = Number(center.y);
    const r = Number(visionRadius);
    const gx = Number(wx) - cx + r;
    const gy = Number(wy) - cy + r;
    if (
      !Number.isFinite(gx) ||
      !Number.isFinite(gy) ||
      gx < 0 ||
      gy < 0 ||
      gx >= gridSize ||
      gy >= gridSize
    ) {
      return null;
    }

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !canvas.width || !canvas.height) {
      const canvasOffsetLeft = (box.w - canvasW) / 2;
      const canvasOffsetTop = (box.h - canvasH) / 2;
      return {
        x: canvasOffsetLeft + AXIS_LEFT + gx * cell + cell / 2,
        y: canvasOffsetTop + AXIS_TOP + gy * cell + cell / 2,
      };
    }

    const wr = wrap.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const scaleX = cr.width / canvas.width;
    const scaleY = cr.height / canvas.height;
    const x = cr.left - wr.left + (AXIS_LEFT + gx * cell + cell / 2) * scaleX;
    const y = cr.top - wr.top + (AXIS_TOP + gy * cell + cell / 2) * scaleY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function worldCenterCanvas(wx: number, wy: number) {
    const gx = wx - center.x + visionRadius;
    const gy = wy - center.y + visionRadius;
    return {
      cx: AXIS_LEFT + gx * cell + cell / 2,
      cy: AXIS_TOP + gy * cell + cell / 2,
      inView: gx >= 0 && gy >= 0 && gx < gridSize && gy < gridSize,
    };
  }

  const selectedTileX = selectedTile?.x ?? null;
  const selectedTileY = selectedTile?.y ?? null;
  const entityUnit =
    selectedEntityId == null
      ? null
      : allUnits.find((u) => u.id === selectedEntityId) ?? null;

  useLayoutEffect(() => {
    const publish = () => {
      const next: ScreenAnchors = {
        tile: null,
        entity: null,
        cellSize: cell,
      };
      if (selectedTileX != null && selectedTileY != null) {
        next.tile = worldToWrap(selectedTileX, selectedTileY);
      }
      if (entityUnit) {
        next.entity = worldToWrap(entityUnit.x, entityUnit.y);
      }
      onAnchorsChange(next);
    };
    publish();
    const id = requestAnimationFrame(publish);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scalars only; worldToWrap uses current layout
  }, [
    selectedTileX,
    selectedTileY,
    selectedEntityId,
    entityUnit?.x,
    entityUnit?.y,
    center.x,
    center.y,
    visionRadius,
    cell,
    canvasW,
    canvasH,
    box.w,
    box.h,
    gridSize,
    onAnchorsChange,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = "#3d9ec9";
    ctx.fillRect(AXIS_LEFT, AXIS_TOP, mapW, mapH);

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const wx = center.x - visionRadius + gx;
        const wy = center.y - visionRadius + gy;
        const t = tileMap.get(`${wx},${wy}`);
        const px = AXIS_LEFT + gx * cell;
        const py = AXIS_TOP + gy * cell;

        if (!t || t.fog) {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(px, py, cell, cell);
        } else {
          ctx.fillStyle = TERRAIN_COLOR[t.terrain] ?? "#444";
          ctx.fillRect(px, py, cell, cell);

          if (!t.inVision) {
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(px, py, cell, cell);
          }

          if (t.resourceType !== "none") {
            const s = Math.max(3, cell * 0.35);
            ctx.fillStyle = "#f5d76e";
            ctx.fillRect(
              px + (cell - s) / 2,
              py + (cell - s) / 2,
              s,
              s,
            );
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
            ctx.arc(
              px + cell / 2,
              py + cell / 2,
              Math.max(2, cell * 0.28),
              0,
              Math.PI * 2,
            );
            ctx.fill();
          } else if (t.claim) {
            ctx.strokeStyle = "rgba(255,255,255,0.75)";
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
          }
        }

        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      }
    }

    ctx.fillStyle = "#e11d8f";
    ctx.font = `bold ${Math.max(10, Math.min(13, AXIS_TOP * 0.38))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "middle";

    const minX = center.x - visionRadius;
    const maxX = center.x + visionRadius;
    const minY = center.y - visionRadius;
    const maxY = center.y + visionRadius;

    ctx.textAlign = "center";
    for (
      let wx = Math.ceil(minX / LABEL_STEP) * LABEL_STEP;
      wx <= maxX;
      wx += LABEL_STEP
    ) {
      const gx = wx - minX;
      const px = AXIS_LEFT + gx * cell + cell / 2;
      ctx.fillText(String(wx), px, AXIS_TOP / 2);
    }

    ctx.textAlign = "right";
    for (
      let wy = Math.ceil(minY / LABEL_STEP) * LABEL_STEP;
      wy <= maxY;
      wy += LABEL_STEP
    ) {
      const gy = wy - minY;
      const py = AXIS_TOP + gy * cell + cell / 2;
      ctx.fillText(String(wy), AXIS_LEFT - 4, py);
    }

    for (const o of others) {
      const gx = o.x - center.x + visionRadius;
      const gy = o.y - center.y + visionRadius;
      if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) continue;
      const cx = AXIS_LEFT + gx * cell + cell / 2;
      const cy = AXIS_TOP + gy * cell + cell / 2;
      const hi = selectedEntityId === o.id;
      ctx.fillStyle = "#f0a0a0";
      ctx.beginPath();
      ctx.arc(cx, cy, otherR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hi ? "#ff2d9b" : "#111";
      ctx.lineWidth = hi ? 2.5 : 1;
      ctx.stroke();
    }

    {
      const gx = player.x - center.x + visionRadius;
      const gy = player.y - center.y + visionRadius;
      if (gx >= 0 && gy >= 0 && gx < gridSize && gy < gridSize) {
        const cx = AXIS_LEFT + gx * cell + cell / 2;
        const cy = AXIS_TOP + gy * cell + cell / 2;
        drawPlayerAvatar(
          ctx,
          cx,
          cy,
          avatarR,
          selectedEntityId === player.id,
        );
      }
    }

    if (selectedTile) {
      const gx = selectedTile.x - center.x + visionRadius;
      const gy = selectedTile.y - center.y + visionRadius;
      if (gx >= 0 && gy >= 0 && gx < gridSize && gy < gridSize) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          AXIS_LEFT + gx * cell + 1,
          AXIS_TOP + gy * cell + 1,
          cell - 2,
          cell - 2,
        );
      }
    }
  }, [
    tileMap,
    center,
    player,
    others,
    selectedTile,
    selectedEntityId,
    gridSize,
    cell,
    canvasW,
    canvasH,
    mapW,
    mapH,
    visionRadius,
    avatarR,
    otherR,
  ]);

  function hitUnit(mx: number, my: number): SelectedEntity | null {
    // prefer top-most: check self first then others (self drawn on top)
    const candidates = [
      { u: player, r: avatarR },
      ...others.map((u) => ({ u, r: otherR })),
    ];
    for (const { u, r } of candidates) {
      const { cx, cy, inView } = worldCenterCanvas(u.x, u.y);
      if (!inView) continue;
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy <= r * r) {
        return {
          type: "player",
          id: u.id,
          name: u.name,
          x: u.x,
          y: u.y,
        };
      }
    }
    return null;
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    if (mx < AXIS_LEFT || my < AXIS_TOP) return;

    const entity = hitUnit(mx, my);
    if (entity) {
      onMapClick({ x: entity.x, y: entity.y, entity });
      return;
    }

    const gx = Math.floor((mx - AXIS_LEFT) / cell);
    const gy = Math.floor((my - AXIS_TOP) / cell);
    if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) return;
    onMapClick({
      x: center.x - visionRadius + gx,
      y: center.y - visionRadius + gy,
      entity: null,
    });
  }

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden bg-white"
    >
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        onClick={onClick}
        className="cursor-crosshair"
        style={{
          width: canvasW,
          height: canvasH,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
