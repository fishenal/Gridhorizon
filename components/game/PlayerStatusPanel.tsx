"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildingEmoji,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";

type OwnedBuilding = {
  id: number;
  type: string;
  name: string | null;
  x: number;
  y: number;
  createdAt: string;
};

type Props = {
  player: {
    name: string;
    emoji?: string;
    gold: number;
    xp?: number;
    x: number;
    y: number;
    status?: string;
  };
  refreshToken?: number;
  onSignOut: () => void;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PlayerStatusPanel({
  player,
  refreshToken = 0,
  onSignOut,
}: Props) {
  const [buildings, setBuildings] = useState<OwnedBuilding[]>([]);
  const [loading, setLoading] = useState(false);
  const face = normalizePlayerEmoji(player.emoji);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/buildings/mine");
      if (!res.ok) return;
      const data = (await res.json()) as { buildings?: OwnedBuilding[] };
      setBuildings(data.buildings ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  return (
    <div className="pointer-events-auto flex w-[180px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="border-b border-stone-200 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl leading-none" aria-hidden>
            {face}
          </span>
          <p className="truncate text-sm font-medium text-stone-900">
            {player.name}
          </p>
        </div>
        <p className="mt-1.5 text-xs text-stone-700">Gold {player.gold}</p>
        {typeof player.xp === "number" ? (
          <p className="text-xs text-stone-700">XP {player.xp}</p>
        ) : null}
        <p className="text-xs text-stone-500">
          ({player.x},{player.y})
          {player.status === "traveling" ? " · moving" : ""}
        </p>
      </div>

      <div className="border-b border-stone-100 px-3 py-1.5">
        <p className="text-[11px] font-medium text-stone-500">
          Assets
          <span className="ml-1 font-normal text-stone-400">
            ({buildings.length})
          </span>
        </p>
      </div>

      <div
        className="overflow-y-auto px-1.5 py-1.5"
        style={{ maxHeight: "min(22vh, 160px)" }}
      >
        {loading && buildings.length === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-stone-400">Loading…</p>
        ) : buildings.length === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-stone-400">No assets yet</p>
        ) : (
          <ul className="space-y-1">
            {buildings.map((b) => (
              <li
                key={b.id}
                className="rounded-lg px-2 py-1.5 hover:bg-stone-50"
              >
                <p className="truncate text-[11px] font-medium text-stone-800">
                  <span aria-hidden>{buildingEmoji(b.type)}</span>
                  {b.name ? ` · ${b.name}` : ""}
                </p>
                <p className="text-[10px] text-stone-500">
                  ({b.x}, {b.y})
                </p>
                <p className="text-[10px] text-stone-400">
                  {formatTime(b.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-stone-200 p-2">
        <button
          type="button"
          onClick={onSignOut}
          className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
