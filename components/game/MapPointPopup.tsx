"use client";

import type { ReactNode } from "react";

type Props = {
  /** Anchor center in map-area local coordinates */
  anchor: { x: number; y: number };
  cellSize: number;
  mapW: number;
  mapH: number;
  width?: number;
  height?: number;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

function clamp(
  left: number,
  top: number,
  w: number,
  h: number,
  mw: number,
  mh: number,
) {
  return {
    left: Math.max(8, Math.min(left, Math.max(8, mw - w - 8))),
    top: Math.max(8, Math.min(top, Math.max(8, mh - h - 8))),
  };
}

/** Positions a card beside the hovered grid cell (not floating far above). */
export function MapPointPopup({
  anchor,
  cellSize,
  mapW,
  mapH,
  width = 192,
  height = 180,
  children,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const gap = 10;
  const half = Math.max(4, cellSize / 2);
  // Never let the popup exceed the map viewport (keeps controls clickable).
  const maxH = Math.max(120, mapH - 16);
  const h = Math.min(height, maxH);

  // Prefer left of cell; if clipped, place to the right
  let rawLeft = anchor.x - half - width - gap;
  if (rawLeft < 8) {
    rawLeft = anchor.x + half + gap;
  }

  // Align card top with cell top so it sits next to the grid, not high above
  let rawTop = anchor.y - half;
  if (rawTop + h > mapH - 8) {
    rawTop = anchor.y + half - h;
  }

  const pos = clamp(rawLeft, rawTop, width, h, mapW, mapH);

  return (
    <div
      className="pointer-events-auto absolute left-0 top-0 z-30"
      style={{
        transform: `translate(${pos.left}px, ${pos.top}px)`,
        maxHeight: h,
        width,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
