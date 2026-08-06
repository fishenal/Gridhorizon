"use client";

import { useEffect, useState } from "react";
import {
  buildingEmoji,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";

export type PlayerProfileTarget = {
  id: number;
  name: string;
  emoji?: string;
  x?: number;
  y?: number;
};

type BuildingRow = {
  id: number;
  type: string;
  name: string | null;
  x: number;
  y: number;
  level: number;
  createdAt: string;
};

type ProfileData = {
  player: {
    id: number;
    name: string;
    emoji: string;
    x: number;
    y: number;
    status: string;
    xp: number;
    gold: number;
  };
  buildings: BuildingRow[];
};

type Props = {
  target: PlayerProfileTarget;
  onClose: () => void;
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

export function PlayerProfileModal({ target, onClose }: Props) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`/api/players/${target.id}`);
        if (!res.ok) {
          if (!cancelled) setError("Could not load player");
          return;
        }
        const json = (await res.json()) as ProfileData;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load player");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const face = normalizePlayerEmoji(
    data?.player.emoji ?? target.emoji,
  );
  const name = data?.player.name ?? target.name;
  const x = data?.player.x ?? target.x;
  const y = data?.player.y ?? target.y;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="player-profile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-stone-100 px-4 py-3">
          <span className="text-3xl leading-none" aria-hidden>
            {face}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="player-profile-title"
              className="truncate text-base font-semibold text-stone-900"
            >
              {name}
            </h2>
            {x != null && y != null ? (
              <p className="text-xs text-stone-500">
                ({x}, {y})
                {data?.player.status === "traveling" ? " · moving" : ""}
              </p>
            ) : null}
            {data ? (
              <p className="mt-1 text-xs text-stone-600">
                Gold {data.player.gold} · XP {data.player.xp}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            Close
          </button>
        </div>

        <div className="border-b border-stone-100 px-4 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
            Assets
            {data ? (
              <span className="ml-1 font-normal normal-case text-stone-400">
                ({data.buildings.length})
              </span>
            ) : null}
          </p>
        </div>

        <div
          className="overflow-y-auto px-3 py-2"
          style={{ maxHeight: "min(50vh, 360px)" }}
        >
          {loading ? (
            <p className="px-1 py-3 text-center text-xs text-stone-400">
              Loading…
            </p>
          ) : error ? (
            <p className="px-1 py-3 text-center text-xs text-red-600">{error}</p>
          ) : !data || data.buildings.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-stone-400">
              No assets yet
            </p>
          ) : (
            <ul className="space-y-2">
              {data.buildings.map((b) => (
                <li
                  key={b.id}
                  className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2"
                >
                  <p className="text-sm font-medium text-stone-800">
                    <span aria-hidden>{buildingEmoji(b.type)}</span>
                    {b.name ? ` · ${b.name}` : ` · ${b.type}`}
                  </p>
                  <p className="text-xs text-pink-600">
                    ({b.x}, {b.y})
                    {b.level > 1 ? ` · Lv ${b.level}` : ""}
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    {formatTime(b.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
