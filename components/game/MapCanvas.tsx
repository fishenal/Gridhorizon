"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildingEmoji,
  displayUnitEmoji,
  FLAG_RANGE_RADIUS,
  FLAG_RANGE_TINT,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";

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
        ownerName?: string;
        ownerEmoji?: string;
        level: number;
        name?: string | null;
        message: string | null;
        createdAt?: string | null;
        tollRadius?: number | null;
      } | null;
      claim: { ownerId: number; askingPrice: number | null } | null;
    };

export type MapPlayer = {
  id: number;
  name: string;
  x: number;
  y: number;
  emoji?: string;
};

export type SelectedPlayer = {
  type: "player";
  id: number;
  name: string;
  x: number;
  y: number;
  emoji: string;
};

export type SelectedFlag = {
  type: "flag";
  id: number;
  name: string;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  ownerEmoji: string;
  createdAt: string | null;
  tollRadius: number;
};

export type SelectedTown = {
  type: "town";
  id: number;
  name: string;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  ownerEmoji: string;
  createdAt: string | null;
  level: number;
};

export type SelectedEntity = SelectedPlayer | SelectedFlag | SelectedTown;

export type ScreenPoint = { x: number; y: number };

export type ScreenAnchors = {
  tile: ScreenPoint | null;
  entity: ScreenPoint | null;
  cellSize: number;
};

type TileTip = {
  label: string;
  gx: number;
  gy: number;
};

type Props = {
  tiles: ViewportTile[];
  center: { x: number; y: number };
  player: MapPlayer;
  others: MapPlayer[];
  visionRadius: number;
  viewRadius: number;
  /** Currently open special point (player, flag, or town). */
  selectedPoint: SelectedEntity | null;
  /** Hover a grid special → open; leave → delayed clear. */
  onPointSelect: (point: SelectedEntity | null) => void;
  onAnchorsChange: (anchors: ScreenAnchors) => void;
};

const TERRAIN_COLOR: Record<string, string> = {
  water: "#3b8ec9",
  grass: "#9bc86a",
  forest: "#2f6b3c",
  mountain: "#7a6352",
  desert: "#e6d391",
  // legacy aliases (old sessions / cached tiles)
  ocean: "#3b8ec9",
  plain: "#9bc86a",
  snow: "#e6d391",
  coast: "#e6d391",
};

const BUILDING_MARK: Record<string, string> = {
  flag: buildingEmoji("flag"),
  waypoint: buildingEmoji("waypoint"),
  town: buildingEmoji("town"),
  mine: buildingEmoji("mine"),
  farm: buildingEmoji("farm"),
  fishery: buildingEmoji("fishery"),
};

function isFlagType(type: string) {
  return type === "flag" || type === "waypoint";
}

function isTownType(type: string) {
  return type === "town";
}

function isHoverBuilding(type: string) {
  return isFlagType(type) || isTownType(type);
}

function buildingLabel(
  b: NonNullable<Extract<ViewportTile, { fog: false }>["building"]>,
) {
  const kind =
    (
      {
        flag: "Flag",
        waypoint: "Flag",
        town: "Town",
        mine: "Mine",
        farm: "Farm",
        fishery: "Fishery",
      } as Record<string, string>
    )[b.type] ?? b.type;
  const name = b.name || b.message;
  return name ? `${kind} "${name}"` : kind;
}

const AXIS_LEFT = 52;
const AXIS_TOP = 32;
const LABEL_STEP = 10;

export function MapCanvas({
  tiles,
  center,
  player,
  others,
  viewRadius,
  selectedPoint,
  onPointSelect,
  onAnchorsChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 640, h: 480 });
  const [tileTip, setTileTip] = useState<TileTip | null>(null);

  const gridSize = viewRadius * 2 + 1;
  const minX = center.x - viewRadius;
  const minY = center.y - viewRadius;
  const maxX = center.x + viewRadius;
  const maxY = center.y + viewRadius;

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

  // Fixed pixel board for a given container; zoom only changes cell count/size
  const mapSide = Math.max(
    80,
    Math.min(box.w - AXIS_LEFT, box.h - AXIS_TOP),
  );
  const cell = Math.max(2, Math.floor(mapSide / gridSize));
  const mapW = gridSize * cell;
  const mapH = gridSize * cell;
  const boardW = AXIS_LEFT + mapW;
  const boardH = AXIS_TOP + mapH;
  const avatarSize = Math.max(10, Math.min(cell * 1.15, cell + 10));
  const otherSize = Math.max(6, Math.min(cell * 0.75, cell + 4));

  const tileMap = useMemo(() => {
    const m = new Map<string, ViewportTile>();
    for (const t of tiles) m.set(`${t.x},${t.y}`, t);
    return m;
  }, [tiles]);

  const cells = useMemo(() => {
    const list: Array<{
      key: string;
      wx: number;
      wy: number;
      gx: number;
      gy: number;
      bg: string;
      dim: boolean;
      building: Extract<ViewportTile, { fog: false }>["building"] | null;
    }> = [];
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const wx = minX + gx;
        const wy = minY + gy;
        const t = tileMap.get(`${wx},${wy}`);
        if (!t || t.fog) {
          list.push({
            key: `${wx},${wy}`,
            wx,
            wy,
            gx,
            gy,
            bg: "#1a1a1a",
            dim: false,
            building: null,
          });
        } else {
          list.push({
            key: `${wx},${wy}`,
            wx,
            wy,
            gx,
            gy,
            bg: TERRAIN_COLOR[t.terrain] ?? "#444",
            dim: !t.inVision,
            building: t.building,
          });
        }
      }
    }
    return list;
  }, [tileMap, gridSize, minX, minY]);

  const xLabels = useMemo(() => {
    const out: Array<{ wx: number; gx: number }> = [];
    for (
      let wx = Math.ceil(minX / LABEL_STEP) * LABEL_STEP;
      wx <= maxX;
      wx += LABEL_STEP
    ) {
      out.push({ wx, gx: wx - minX });
    }
    return out;
  }, [minX, maxX]);

  const yLabels = useMemo(() => {
    const out: Array<{ wy: number; gy: number }> = [];
    for (
      let wy = Math.ceil(minY / LABEL_STEP) * LABEL_STEP;
      wy <= maxY;
      wy += LABEL_STEP
    ) {
      out.push({ wy, gy: wy - minY });
    }
    return out;
  }, [minY, maxY]);

  const units = useMemo(() => {
    return [
      { u: player, self: true as const },
      ...others.map((u) => ({ u, self: false as const })),
    ];
  }, [player, others]);

  const flagsInView = useMemo(() => {
    const list: Array<{
      id: number;
      x: number;
      y: number;
      radius: number;
    }> = [];
    for (const t of tiles) {
      if (t.fog || !t.building || !isFlagType(t.building.type)) continue;
      list.push({
        id: t.building.id,
        x: t.x,
        y: t.y,
        radius: t.building.tollRadius ?? FLAG_RANGE_RADIUS,
      });
    }
    return list;
  }, [tiles]);

  const selectedFlag = useMemo(() => {
    if (selectedPoint?.type !== "flag") return null;
    return (
      flagsInView.find((f) => f.id === selectedPoint.id) ?? {
        id: selectedPoint.id,
        x: selectedPoint.x,
        y: selectedPoint.y,
        radius: selectedPoint.tollRadius,
      }
    );
  }, [flagsInView, selectedPoint]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const board = boardRef.current;
    const next: ScreenAnchors = {
      tile: null,
      entity: null,
      cellSize: cell,
    };
    if (selectedPoint && wrap && board) {
      const gx = selectedPoint.x - minX;
      const gy = selectedPoint.y - minY;
      if (gx >= 0 && gy >= 0 && gx < gridSize && gy < gridSize) {
        // Wrap-local coords of cell center (wrap fills map area)
        const wr = wrap.getBoundingClientRect();
        const br = board.getBoundingClientRect();
        next.entity = {
          x: br.left - wr.left + AXIS_LEFT + gx * cell + cell / 2,
          y: br.top - wr.top + AXIS_TOP + gy * cell + cell / 2,
        };
      }
    }
    onAnchorsChange(next);
  }, [
    selectedPoint,
    cell,
    player.x,
    player.y,
    others,
    center.x,
    center.y,
    boardW,
    boardH,
    viewRadius,
    minX,
    minY,
    gridSize,
    onAnchorsChange,
  ]);

  function resolvePointAt(wx: number, wy: number): SelectedEntity | null {
    const atPlayer = [player, ...others].find((u) => u.x === wx && u.y === wy);
    if (atPlayer) {
      return {
        type: "player",
        id: atPlayer.id,
        name: atPlayer.name,
        x: atPlayer.x,
        y: atPlayer.y,
        emoji: normalizePlayerEmoji(atPlayer.emoji),
      };
    }
    const t = tileMap.get(`${wx},${wy}`);
    const b = t && !t.fog ? t.building : null;
    if (b && isFlagType(b.type)) {
      return {
        type: "flag",
        id: b.id,
        name: b.name || b.message || "Flag",
        x: wx,
        y: wy,
        ownerId: b.ownerId,
        ownerName: b.ownerName ?? `#${b.ownerId}`,
        ownerEmoji: normalizePlayerEmoji(b.ownerEmoji),
        createdAt: b.createdAt ?? null,
        tollRadius: b.tollRadius ?? FLAG_RANGE_RADIUS,
      };
    }
    if (b && isTownType(b.type)) {
      return {
        type: "town",
        id: b.id,
        name: b.name || b.message || "Town",
        x: wx,
        y: wy,
        ownerId: b.ownerId,
        ownerName: b.ownerName ?? `#${b.ownerId}`,
        ownerEmoji: normalizePlayerEmoji(b.ownerEmoji),
        createdAt: b.createdAt ?? null,
        level: b.level ?? 1,
      };
    }
    return null;
  }

  function handlePointEnter(wx: number, wy: number) {
    const point = resolvePointAt(wx, wy);
    if (point) onPointSelect(point);
  }

  function handlePointLeave() {
    onPointSelect(null);
  }

  const showTileTip = tileTip && selectedPoint == null;

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden bg-white"
    >
      <div
        ref={boardRef}
        className="relative shrink-0"
        style={{ width: boardW, height: boardH }}
      >
        <div
          className="absolute text-center text-[10px] font-bold text-pink-600"
          style={{ left: AXIS_LEFT, top: 0, width: mapW, height: AXIS_TOP }}
        >
          {xLabels.map(({ wx, gx }) => (
            <span
              key={wx}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: gx * cell + cell / 2 }}
            >
              {wx}
            </span>
          ))}
        </div>

        <div
          className="absolute text-right text-[10px] font-bold text-pink-600"
          style={{ left: 0, top: AXIS_TOP, width: AXIS_LEFT, height: mapH }}
        >
          {yLabels.map(({ wy, gy }) => (
            <span
              key={wy}
              className="absolute right-1 -translate-y-1/2"
              style={{ top: gy * cell + cell / 2 }}
            >
              {wy}
            </span>
          ))}
        </div>

        <div
          className="absolute bg-[#3d9ec9]"
          style={{
            left: AXIS_LEFT,
            top: AXIS_TOP,
            width: mapW,
            height: mapH,
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize}, ${cell}px)`,
            gridTemplateRows: `repeat(${gridSize}, ${cell}px)`,
          }}
        >
          {cells.map((c) => {
            const b = c.building;
            const markGlyph = b
              ? (BUILDING_MARK[b.type] ?? buildingEmoji(b.type))
              : null;
            const tipLabel = b
              ? `(${c.wx}, ${c.wy}) · ${buildingLabel(b)}`
              : `(${c.wx}, ${c.wy})`;
            const fontPx = Math.max(10, Math.min(cell * 0.78, 22));

            let rangeStrong = false;
            let inFlagRange = false;
            if (selectedFlag) {
              const d = Math.max(
                Math.abs(c.wx - selectedFlag.x),
                Math.abs(c.wy - selectedFlag.y),
              );
              if (d <= selectedFlag.radius) {
                inFlagRange = true;
                rangeStrong = true;
              }
            }
            if (!inFlagRange) {
              for (const f of flagsInView) {
                const d = Math.max(
                  Math.abs(c.wx - f.x),
                  Math.abs(c.wy - f.y),
                );
                if (d > f.radius) continue;
                inFlagRange = true;
                break;
              }
            }

            const hasPlayer = [player, ...others].some(
              (u) => u.x === c.wx && u.y === c.wy,
            );
            const isSpecial =
              hasPlayer || Boolean(b && isHoverBuilding(b.type));

            return (
              <div
                key={c.key}
                className={`relative box-border border border-black/80 ${
                  isSpecial ? "cursor-pointer" : ""
                }`}
                style={{ backgroundColor: c.bg, width: cell, height: cell }}
                onMouseEnter={() => {
                  setTileTip({
                    label: tipLabel,
                    gx: c.gx,
                    gy: c.gy,
                  });
                  if (isSpecial) handlePointEnter(c.wx, c.wy);
                }}
                onMouseLeave={() => {
                  setTileTip(null);
                  if (isSpecial) handlePointLeave();
                }}
              >
                {inFlagRange ? (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundColor: FLAG_RANGE_TINT,
                      opacity: rangeStrong ? 0.28 : 0.12,
                      boxShadow: rangeStrong
                        ? `inset 0 0 0 1px ${FLAG_RANGE_TINT}`
                        : undefined,
                    }}
                  />
                ) : null}
                {markGlyph ? (
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center leading-none"
                    style={{ fontSize: fontPx }}
                    aria-hidden
                  >
                    {markGlyph}
                  </span>
                ) : null}
                {c.dim ? (
                  <div className="pointer-events-none absolute inset-0 bg-black/45" />
                ) : null}
              </div>
            );
          })}
        </div>

        {showTileTip ? (
          <div
            className="pointer-events-none absolute z-20 whitespace-nowrap rounded bg-stone-900/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{
              left: AXIS_LEFT + tileTip.gx * cell + cell / 2,
              top: AXIS_TOP + tileTip.gy * cell - 2,
              transform: "translate(-50%, -100%)",
            }}
          >
            {tileTip.label}
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute z-10"
          style={{ left: AXIS_LEFT, top: AXIS_TOP, width: mapW, height: mapH }}
        >
          {units.map(({ u, self }) => {
            const gx = u.x - minX;
            const gy = u.y - minY;
            if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) {
              return null;
            }
            const size = self ? avatarSize : otherSize;
            const highlight =
              selectedPoint?.type === "player" && selectedPoint.id === u.id;
            const tile = tileMap.get(`${u.x},${u.y}`);
            const terrain = tile && !tile.fog ? tile.terrain : undefined;
            const face = displayUnitEmoji(u.emoji, terrain);
            const facePx = Math.max(10, Math.min(size * 0.85, 28));
            return (
              <button
                key={u.id}
                type="button"
                onMouseEnter={() => handlePointEnter(u.x, u.y)}
                onMouseLeave={handlePointLeave}
                className="pointer-events-auto absolute flex items-center justify-center bg-transparent"
                style={{
                  left: gx * cell + cell / 2,
                  top: gy * cell + cell / 2,
                  width: size,
                  height: size,
                  transform: "translate(-50%, -50%)",
                  fontSize: facePx,
                  lineHeight: 1,
                  filter: highlight
                    ? "drop-shadow(0 0 2px #ff2d9b)"
                    : undefined,
                }}
                aria-label={u.name}
              >
                <span aria-hidden>{face}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
