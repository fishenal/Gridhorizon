"use client";

type Props = {
  zoomLevel: number;
  visionRadius: number;
  onZoomLevelChange: (level: number) => void;
};

const ZOOM_MIN = -2;
const ZOOM_MAX = 2;

function gridSizeForZoom(level: number, visionR: number) {
  const viewR = Math.max(1, Math.round(visionR * 2 ** -level));
  return viewR * 2 + 1;
}

export function ZoomSlider({
  zoomLevel,
  visionRadius,
  onZoomLevelChange,
}: Props) {
  const gridSize = gridSizeForZoom(zoomLevel, visionRadius);

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur">
      <span className="shrink-0 text-[10px] text-stone-500">Out</span>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={1}
        value={zoomLevel}
        onChange={(e) => onZoomLevelChange(Number(e.target.value))}
        className="h-1.5 w-36 cursor-pointer accent-pink-500 sm:w-48"
        aria-label="Map zoom"
      />
      <span className="shrink-0 text-[10px] text-stone-500">In</span>
      <span className="min-w-14 shrink-0 text-right text-[10px] font-medium text-stone-700">
        {gridSize}×{gridSize}
      </span>
    </div>
  );
}
