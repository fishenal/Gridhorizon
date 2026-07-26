"use client";

type Props = {
  x: number;
  y: number;
  canActHere: boolean;
  busy: boolean;
  onClose: () => void;
  onWaypoint: () => void;
  onClaim: () => void;
};

export function TilePopup({
  x,
  y,
  canActHere,
  busy,
  onClose,
  onWaypoint,
  onClaim,
}: Props) {
  return (
    <div className="pointer-events-auto w-56 rounded-xl border border-pink-200 bg-pink-50/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-pink-700">
          坐标：{x}, {y}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-pink-500 hover:text-pink-800"
        >
          关闭
        </button>
      </div>
      {!canActHere ? (
        <p className="mb-2 text-xs text-pink-600/80">
          路标/占领需站在此格上
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || !canActHere}
          onClick={onWaypoint}
          className="rounded-full border border-pink-300 bg-white px-2 py-1.5 text-sm text-pink-700 hover:bg-pink-100 disabled:opacity-40"
        >
          路标
        </button>
        <button
          type="button"
          disabled={busy || !canActHere}
          onClick={onClaim}
          className="rounded-full border border-pink-300 bg-white px-2 py-1.5 text-sm text-pink-700 hover:bg-pink-100 disabled:opacity-40"
        >
          占领
        </button>
        <button
          type="button"
          disabled
          title="后续完善"
          className="rounded-full border border-pink-200 bg-white/70 px-2 py-1.5 text-sm text-pink-400"
        >
          xxx
        </button>
        <button
          type="button"
          disabled
          title="后续完善"
          className="rounded-full border border-pink-200 bg-white/70 px-2 py-1.5 text-sm text-pink-400"
        >
          建设
        </button>
      </div>
    </div>
  );
}
