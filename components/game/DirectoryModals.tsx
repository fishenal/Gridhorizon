"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  buildingEmoji,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import { ExploredStat } from "@/components/game/ExploredStat";
import { ResourceRow } from "@/components/game/ResourceRow";

export type DirectoryPlayer = {
  id: number;
  name: string;
  emoji: string;
  bubble: string;
  x: number;
  y: number;
  status: string;
  xp: number;
  exploredCells?: number;
  gold: number;
  population?: number;
  online: boolean;
  createdAt: string;
};

export type DirectoryBuilding = {
  id: number;
  type: string;
  name: string | null;
  x: number;
  y: number;
  level: number;
  ownerId: number;
  ownerName: string;
  ownerEmoji: string;
  createdAt: string;
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

function ModalShell({
  title,
  count,
  onClose,
  children,
}: {
  title: string;
  count?: number;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="directory-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
          <h2
            id="directory-modal-title"
            className="text-base font-semibold text-stone-900"
          >
            {title}
            {typeof count === "number" ? (
              <span className="ml-1.5 font-normal text-stone-400">
                ({count})
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            Close
          </button>
        </div>
        <div
          className="overflow-y-auto px-3 py-2"
          style={{ maxHeight: "min(60vh, 420px)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type PlayersModalProps = {
  onClose: () => void;
  onPlayerClick?: (player: DirectoryPlayer) => void;
};

export function AllPlayersModal({ onClose, onPlayerClick }: PlayersModalProps) {
  const [rows, setRows] = useState<DirectoryPlayer[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/players");
        if (!res.ok) {
          if (!cancelled) setError("Could not load players");
          return;
        }
        const data = (await res.json()) as { players?: DirectoryPlayer[] };
        if (!cancelled) setRows(data.players ?? []);
      } catch {
        if (!cancelled) setError("Could not load players");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ModalShell title="All players" count={rows?.length} onClose={onClose}>
      {loading ? (
        <p className="px-1 py-6 text-center text-xs text-stone-400">Loading…</p>
      ) : error ? (
        <p className="px-1 py-6 text-center text-xs text-red-600">{error}</p>
      ) : !rows || rows.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-stone-400">
          No players yet
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPlayerClick?.(p)}
                className="flex w-full items-start gap-2 rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2 text-left hover:bg-stone-100"
              >
                <span
                  className="text-xl leading-none"
                  aria-hidden
                  style={{ opacity: p.online ? 1 : 0.45 }}
                >
                  {normalizePlayerEmoji(p.emoji)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {p.name}
                    <span className="ml-1.5 text-[10px] font-normal text-stone-400">
                      {p.online ? "online" : "offline"}
                      {p.status === "traveling" ? " · moving" : ""}
                    </span>
                  </p>
                  <p className="text-xs text-pink-600">
                    ({p.x}, {p.y})
                  </p>
                  <ResourceRow
                    className="mt-0.5 text-xs text-stone-600"
                    skipZero={false}
                    parts={[
                      ["gold", p.gold],
                      ["population", p.population ?? 0],
                      ["xp", p.xp],
                    ]}
                  />
                  <ExploredStat
                    className="mt-0.5 text-xs text-stone-600"
                    cells={p.exploredCells}
                  />
                  {p.bubble ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-600">
                      {p.bubble}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-stone-400">No bubble</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

type AssetsModalProps = {
  onClose: () => void;
  onOwnerClick?: (owner: {
    id: number;
    name: string;
    emoji: string;
  }) => void;
};

export function AllAssetsModal({ onClose, onOwnerClick }: AssetsModalProps) {
  const [rows, setRows] = useState<DirectoryBuilding[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/buildings");
        if (!res.ok) {
          if (!cancelled) setError("Could not load assets");
          return;
        }
        const data = (await res.json()) as { buildings?: DirectoryBuilding[] };
        if (!cancelled) setRows(data.buildings ?? []);
      } catch {
        if (!cancelled) setError("Could not load assets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ModalShell title="All assets" count={rows?.length} onClose={onClose}>
      {loading ? (
        <p className="px-1 py-6 text-center text-xs text-stone-400">Loading…</p>
      ) : error ? (
        <p className="px-1 py-6 text-center text-xs text-red-600">{error}</p>
      ) : !rows || rows.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-stone-400">
          No assets yet
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => (
            <li
              key={b.id}
              className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2"
            >
              <p className="text-sm font-medium text-stone-800">
                <span aria-hidden>{buildingEmoji(b.type)}</span>
                {b.name ? ` · ${b.name}` : ` · ${b.type}`}
                {b.level > 1 ? (
                  <span className="ml-1 text-xs font-normal text-stone-500">
                    Lv {b.level}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-pink-600">
                ({b.x}, {b.y})
              </p>
              <button
                type="button"
                onClick={() =>
                  onOwnerClick?.({
                    id: b.ownerId,
                    name: b.ownerName,
                    emoji: b.ownerEmoji,
                  })
                }
                className="mt-1 flex items-center gap-1 text-[11px] text-stone-600 hover:text-stone-900"
              >
                <span aria-hidden>
                  {normalizePlayerEmoji(b.ownerEmoji)}
                </span>
                <span className="truncate">{b.ownerName}</span>
              </button>
              <p className="mt-0.5 text-[10px] text-stone-400">
                {formatTime(b.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
