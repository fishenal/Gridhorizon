"use client";

type Props = {
  name: string;
  gold?: number;
  xp?: number;
  x: number;
  y: number;
  isSelf: boolean;
  busy?: boolean;
  onClose: () => void;
  onWaypoint?: () => void;
};

export function UserCard({
  name,
  gold,
  xp,
  x,
  y,
  isSelf,
  busy,
  onClose,
  onWaypoint,
}: Props) {
  return (
    <div className="pointer-events-auto w-44 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-800 bg-[#f5d76e]"
            aria-hidden
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="10" r="1.2" fill="#1a1a1a" />
              <circle cx="15" cy="10" r="1.2" fill="#1a1a1a" />
              <path
                d="M8 14c1.2 1.5 2.8 2.2 4 2.2s2.8-.7 4-2.2"
                stroke="#1a1a1a"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="truncate text-sm font-medium text-pink-600">{name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs text-stone-400 hover:text-stone-700"
        >
          关闭
        </button>
      </div>
      <p className="text-sm text-pink-600">
        坐标：({x}, {y})
      </p>
      {isSelf ? (
        <>
          <p className="text-sm text-pink-600">金钱：{gold ?? 0}</p>
          <p className="mb-2 text-sm text-pink-600">经验：{xp ?? 0}</p>
          {onWaypoint ? (
            <button
              type="button"
              disabled={busy}
              onClick={onWaypoint}
              className="w-full rounded-lg border border-pink-300 bg-white px-2 py-1.5 text-sm text-pink-700 hover:bg-pink-100 disabled:opacity-40"
            >
              设立路标
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
