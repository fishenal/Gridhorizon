"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildingEmoji } from "@/lib/game/playerStyle";

type Tab = "log" | "assets";

export type ActivityEntry = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type OwnedBuilding = {
  id: number;
  type: string;
  name: string | null;
  x: number;
  y: number;
  createdAt: string;
};

type Props = {
  /** Bump to refetch logs / buildings from server */
  refreshToken?: number;
  /** Optimistic entries shown immediately (negative ids) */
  localLogs?: ActivityEntry[];
  /** Called after server fetch with local ids that matched server rows */
  onLocalLogsMatched?: (ids: number[]) => void;
};

function asPoint(v: unknown): { x: number; y: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { x?: unknown; y?: unknown };
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  return { x: o.x, y: o.y };
}

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

function formatActivity(entry: ActivityEntry): string {
  const p = entry.payload;
  switch (entry.type) {
    case "travel_start": {
      const from = asPoint(p.from);
      const to = asPoint(p.to);
      const steps = typeof p.steps === "number" ? p.steps : null;
      if (from && to) {
        return `Moved from (${from.x},${from.y}) to (${to.x},${to.y})${
          steps != null ? ` · ${steps} steps` : ""
        }`;
      }
      return "Started travel";
    }
    case "travel_stop": {
      const at = asPoint(p.at);
      return at ? `Stopped at (${at.x},${at.y})` : "Stopped travel";
    }
    case "travel_arrive": {
      const at = asPoint(p.at);
      return at ? `Arrived at (${at.x},${at.y})` : "Arrived";
    }
    case "build": {
      const kind = buildingEmoji(String(p.buildingType ?? ""));
      const name = typeof p.name === "string" && p.name ? ` "${p.name}"` : "";
      const x = typeof p.x === "number" ? p.x : null;
      const y = typeof p.y === "number" ? p.y : null;
      if (x != null && y != null) {
        return `Built ${kind}${name} at (${x},${y})`;
      }
      return `Built ${kind}${name}`;
    }
    default:
      return entry.type;
  }
}

/** Stable key so optimistic rows can be reconciled with server rows. */
export function activityFingerprint(entry: ActivityEntry): string {
  const p = entry.payload;
  switch (entry.type) {
    case "travel_start": {
      const from = asPoint(p.from);
      const to = asPoint(p.to);
      return `travel_start:${from?.x},${from?.y}->${to?.x},${to?.y}:${p.steps}`;
    }
    case "travel_stop": {
      const at = asPoint(p.at);
      return `travel_stop:${at?.x},${at?.y}`;
    }
    case "travel_arrive": {
      const at = asPoint(p.at);
      return `travel_arrive:${at?.x},${at?.y}`;
    }
    case "build":
      return `build:${p.buildingType}:${p.x},${p.y}:${p.name ?? ""}`;
    default:
      return `${entry.type}:${JSON.stringify(p)}`;
  }
}

export function makeLocalActivity(
  type: string,
  payload: Record<string, unknown>,
  id: number,
): ActivityEntry {
  return {
    id,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function JournalPanel({
  refreshToken = 0,
  localLogs = [],
  onLocalLogsMatched,
}: Props) {
  const [tab, setTab] = useState<Tab>("log");
  const [serverLogs, setServerLogs] = useState<ActivityEntry[]>([]);
  const [buildings, setBuildings] = useState<OwnedBuilding[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, bldRes] = await Promise.all([
        fetch("/api/activity"),
        fetch("/api/buildings/mine"),
      ]);
      if (actRes.ok) {
        const data = (await actRes.json()) as { logs?: ActivityEntry[] };
        const next = data.logs ?? [];
        setServerLogs(next);
        if (localLogs.length > 0 && onLocalLogsMatched) {
          const serverKeys = new Set(next.map(activityFingerprint));
          const matched = localLogs
            .filter((l) => serverKeys.has(activityFingerprint(l)))
            .map((l) => l.id);
          if (matched.length > 0) onLocalLogsMatched(matched);
        }
      }
      if (bldRes.ok) {
        const data = (await bldRes.json()) as { buildings?: OwnedBuilding[] };
        setBuildings(data.buildings ?? []);
      }
    } catch {
      // ignore network blips
    } finally {
      setLoading(false);
    }
  }, [localLogs, onLocalLogsMatched]);

  useEffect(() => {
    void load();
    // Intentionally depend on refreshToken only for refetch cadence;
    // localLogs reconciliation runs inside load when fetch completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const displayLogs = useMemo(() => {
    const serverKeys = new Set(serverLogs.map(activityFingerprint));
    const pending = localLogs.filter(
      (l) => !serverKeys.has(activityFingerprint(l)),
    );
    return [...pending, ...serverLogs];
  }, [localLogs, serverLogs]);

  return (
    <div className="pointer-events-auto flex w-[260px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setTab("log")}
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            tab === "log"
              ? "bg-stone-100 text-stone-900"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          Log
        </button>
        <button
          type="button"
          onClick={() => setTab("assets")}
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            tab === "assets"
              ? "bg-stone-100 text-stone-900"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          Assets
        </button>
      </div>

      <div
        className="overflow-y-auto p-2"
        style={{ maxHeight: "min(42vh, calc(100dvh - 280px))" }}
      >
        {loading && displayLogs.length === 0 && buildings.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-stone-400">Loading…</p>
        ) : tab === "log" ? (
          displayLogs.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-stone-400">No activity yet</p>
          ) : (
            <ul className="space-y-2">
              {displayLogs.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-stone-100 bg-white/80 px-2 py-1.5"
                >
                  <p className="text-[11px] leading-snug text-stone-800">
                    {formatActivity(entry)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    {formatTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : buildings.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-stone-400">
            No assets yet
          </p>
        ) : (
          <ul className="space-y-2">
            {buildings.map((b) => (
              <li
                key={b.id}
                className="rounded-lg border border-stone-100 bg-white/80 px-2 py-1.5"
              >
                <p className="text-[11px] font-medium text-stone-800">
                  <span aria-hidden>{buildingEmoji(b.type)}</span>
                  {b.name ? ` · ${b.name}` : ""}
                </p>
                <p className="text-[11px] text-pink-600">
                  ({b.x}, {b.y})
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
  );
}
