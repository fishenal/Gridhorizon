"use client";

import { normalizePlayerEmoji } from "@/lib/game/playerStyle";

export type OnlinePlayer = {
  id: number;
  name: string;
  emoji: string;
  x: number;
  y: number;
  status: string;
  isSelf?: boolean;
};

type Props = {
  players: OnlinePlayer[];
  /** Keep self coords in sync with local travel */
  self?: { id: number; name: string; emoji?: string; x: number; y: number };
  onPlayerClick?: (player: OnlinePlayer) => void;
};

export function OnlinePlayers({ players, self, onPlayerClick }: Props) {
  const display = players.map((p) => {
    if (self && p.id === self.id) {
      return {
        ...p,
        x: self.x,
        y: self.y,
        name: self.name,
        emoji: normalizePlayerEmoji(self.emoji ?? p.emoji),
        isSelf: true,
      };
    }
    return {
      ...p,
      emoji: normalizePlayerEmoji(p.emoji),
    };
  });

  const list =
    display.length > 0
      ? display
      : self
        ? [
            {
              id: self.id,
              name: self.name,
              emoji: normalizePlayerEmoji(self.emoji),
              x: self.x,
              y: self.y,
              status: "idle",
              isSelf: true,
            },
          ]
        : [];

  return (
    <div className="pointer-events-auto flex w-[180px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="border-b border-stone-200 px-3 py-2">
        <p className="text-xs font-medium text-stone-900">
          Online
          <span className="ml-1 font-normal text-stone-500">
            ({list.length})
          </span>
        </p>
      </div>
      <ul
        className="overflow-y-auto p-1.5"
        style={{ maxHeight: "min(28vh, 220px)" }}
      >
        {list.length === 0 ? (
          <li className="px-2 py-1.5 text-[11px] text-stone-400">No one here</li>
        ) : (
          list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPlayerClick?.(p)}
                className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50"
              >
                <span className="text-base leading-none" aria-hidden>
                  {p.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-stone-800">
                    {p.name}
                    {p.isSelf ? (
                      <span className="ml-1 font-normal text-stone-400">
                        you
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[10px] text-stone-500">
                    ({p.x},{p.y})
                    {p.status === "traveling" ? " · moving" : ""}
                  </p>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
