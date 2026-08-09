"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildingEmoji } from "@/lib/game/playerStyle";

export type ActivityEntry = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type Props = {
  /** Bump to refetch logs from server */
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
    case "toll_paid": {
      const amount = typeof p.amount === "number" ? p.amount : 0;
      const kind = buildingEmoji(String(p.buildingType ?? ""));
      const name =
        typeof p.buildingName === "string" && p.buildingName
          ? ` "${p.buildingName}"`
          : "";
      const owner =
        typeof p.ownerName === "string" && p.ownerName
          ? p.ownerName
          : "someone";
      const at = asPoint(p.at);
      return `Paid ${amount} gold toll at ${kind}${name} (${owner})${
        at ? ` · (${at.x},${at.y})` : ""
      }`;
    }
    case "toll_received": {
      const amount = typeof p.amount === "number" ? p.amount : 0;
      const kind = buildingEmoji(String(p.buildingType ?? ""));
      const name =
        typeof p.buildingName === "string" && p.buildingName
          ? ` "${p.buildingName}"`
          : "";
      const from =
        typeof p.fromPlayerName === "string" && p.fromPlayerName
          ? p.fromPlayerName
          : "a traveler";
      const at = asPoint(p.at);
      return `Received ${amount} gold toll at ${kind}${name} from ${from}${
        at ? ` · (${at.x},${at.y})` : ""
      }`;
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
    case "toll_paid": {
      const at = asPoint(p.at);
      return `toll_paid:${p.buildingId}:${p.amount}:${at?.x},${at?.y}`;
    }
    case "toll_received": {
      const at = asPoint(p.at);
      return `toll_received:${p.buildingId}:${p.fromPlayerId}:${p.amount}:${at?.x},${at?.y}`;
    }
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
  const [serverLogs, setServerLogs] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const actRes = await fetch("/api/activity");
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
    const byKey = new Map<string, ActivityEntry>();
    for (const e of [...serverLogs].reverse()) {
      byKey.set(activityFingerprint(e), e);
    }
    for (const e of localLogs) {
      const k = activityFingerprint(e);
      if (!byKey.has(k)) byKey.set(k, e);
    }
    return [...byKey.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }, [localLogs, serverLogs]);

  return (
    <div className="pointer-events-auto flex w-[260px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="border-b border-stone-200 px-3 py-2">
        <p className="text-xs font-medium text-stone-900">Log</p>
      </div>

      <div
        className="overflow-y-auto p-2"
        style={{ maxHeight: "min(42vh, calc(100dvh - 280px))" }}
      >
        {loading && displayLogs.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-stone-400">Loading…</p>
        ) : displayLogs.length === 0 ? (
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
        )}
      </div>
    </div>
  );
}
