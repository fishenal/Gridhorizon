"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  /** Play vision circle; tiles already encode inVision. Kept for API symmetry. */
  visionRadius: number;
  viewRadius: number;
  selectedEntityId: number | null;
  onEntityHoverChange: (entity: SelectedEntity | null) => void;
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

export function MapCanvas({
  tiles,
  center,
  player,
  others,
  viewRadius,
  selectedEntityId,
  onEntityHoverChange,
  onAnchorsChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const entityRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
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

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const next: ScreenAnchors = {
      tile: null,
      entity: null,
      cellSize: cell,
    };
    if (selectedEntityId != null && wrap) {
      const el = entityRefs.current.get(selectedEntityId);
      if (el) {
        const wr = wrap.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        next.entity = {
          x: er.left + er.width / 2 - wr.left,
          y: er.top + er.height / 2 - wr.top,
        };
      }
    }
    onAnchorsChange(next);
  }, [
    selectedEntityId,
    cell,
    player.x,
    player.y,
    others,
    center.x,
    center.y,
    boardW,
    boardH,
    viewRadius,
    onAnchorsChange,
  ]);

  function setEntityRef(id: number, el: HTMLButtonElement | null) {
    if (el) entityRefs.current.set(id, el);
    else entityRefs.current.delete(id);
  }

  function onEntityEnter(u: MapPlayer) {
    setTileTip(null);
    onEntityHoverChange({
      type: "player",
      id: u.id,
      name: u.name,
      x: u.x,
      y: u.y,
    });
  }

  function onEntityLeave() {
    onEntityHoverChange(null);
  }

  const showTileTip = tileTip && selectedEntityId == null;

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden bg-white"
    >
      <div
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
          {cells.map((c) => (
            <div
              key={c.key}
              className="relative box-border border border-black/80"
              style={{ backgroundColor: c.bg, width: cell, height: cell }}
              onMouseEnter={() =>
                setTileTip({
                  label: `(${c.wx}, ${c.wy})`,
                  gx: c.gx,
                  gy: c.gy,
                })
              }
              onMouseLeave={() => setTileTip(null)}
            >
              {c.dim ? (
                <div className="pointer-events-none absolute inset-0 bg-black/45" />
              ) : null}
            </div>
          ))}
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
            const highlight = selectedEntityId === u.id;
            return (
              <button
                key={u.id}
                ref={(el) => setEntityRef(u.id, el)}
                type="button"
                onMouseEnter={() => onEntityEnter(u)}
                onMouseLeave={onEntityLeave}
                className="pointer-events-auto absolute flex items-center justify-center rounded-full border bg-[#f5d76e]"
                style={{
                  left: gx * cell + cell / 2,
                  top: gy * cell + cell / 2,
                  width: size,
                  height: size,
                  borderColor: highlight ? "#ff2d9b" : "#1a1a1a",
                  borderWidth: highlight ? 2 : 1,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: self ? "#f5d76e" : "#f0a0a0",
                }}
                aria-label={u.name}
              >
                {self ? (
                  <svg
                    width={size * 0.55}
                    height={size * 0.55}
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle cx="9" cy="10" r="1.2" fill="#1a1a1a" />
                    <circle cx="15" cy="10" r="1.2" fill="#1a1a1a" />
                    <path
                      d="M8 14c1.2 1.5 2.8 2.2 4 2.2s2.8-.7 4-2.2"
                      stroke="#1a1a1a"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
