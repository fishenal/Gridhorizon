"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildingEmoji } from "@/lib/game/playerStyle";
import { formatTollNotice } from "@/lib/game/tollNotice";
import { workplaceLabel } from "@/lib/game/workplaceMeta";
import {
  WORK_GOLD_PER_MINUTE,
  WORK_OWNER_GRANT,
} from "@/lib/map/constants";

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
  workBusy?: boolean;
  activeWorkBuildingId?: number | null;
  onAcceptWork?: (buildingId: number) => void;
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
      const town = p.buildingType === "town";
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
      const where = `${kind}${name} (${owner})${at ? ` · (${at.x},${at.y})` : ""}`;
      return town
        ? `Spent ${amount} gold drinking at ${where}`
        : `Paid ${amount} gold toll at ${where}`;
    }
    case "toll_received": {
      const amount = typeof p.amount === "number" ? p.amount : 0;
      const town = p.buildingType === "town";
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
      const where = `${kind}${name}${at ? ` · (${at.x},${at.y})` : ""}`;
      return town
        ? `${from} spent ${amount} gold drinking at ${where}`
        : `Received ${amount} gold toll at ${where} from ${from}`;
    }
    case "work_offer": {
      const owner =
        typeof p.ownerName === "string" && p.ownerName
          ? p.ownerName
          : "someone";
      const kind = workplaceLabel(String(p.buildingType ?? ""));
      const name =
        typeof p.buildingName === "string" && p.buildingName
          ? ` ${p.buildingName}`
          : "";
      const status = String(p.status ?? "pending");
      if (status === "accepted") {
        return `Started working at ${owner}'s ${kind}${name}.`;
      }
      return `Entered ${owner}'s ${kind}${name}. Work here for ${WORK_GOLD_PER_MINUTE} gold/min? Owner gains ${WORK_OWNER_GRANT} immediately.`;
    }
    case "toll_notice": {
      const role = p.role === "owner" ? "owner" : "payer";
      const { body } = formatTollNotice({
        id: 0,
        role,
        buildingType: String(p.buildingType ?? "flag"),
        buildingName:
          typeof p.buildingName === "string" ? p.buildingName : null,
        otherPlayerName: String(
          p.otherPlayerName ?? (role === "owner" ? "A traveler" : "someone"),
        ),
        amount: typeof p.amount === "number" ? p.amount : 0,
      });
      return body;
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
      return `toll_received:${p.buildingId}:${p.fromPlayerId}:${p.amount}`;
    }
    case "work_offer":
      return `work_offer:${p.buildingId}:${entry.id}`;
    case "toll_notice":
      return `toll_notice:${p.role}:${p.buildingId}:${p.amount}:${entry.id}`;
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

function logCardClass(entry: ActivityEntry): string {
  const p = entry.payload;
  const type = entry.type;
  if (type === "work_offer") {
    const accepted = p.status === "accepted";
    return accepted
      ? "border-sky-200 bg-sky-50/70"
      : "border-sky-300 bg-sky-100";
  }
  if (type === "toll_notice" || type === "toll_paid" || type === "toll_received") {
    const town = p.buildingType === "town";
    const owner = type === "toll_received" || p.role === "owner";
    if (owner) {
      return town
        ? "border-emerald-300 bg-emerald-100"
        : "border-lime-300 bg-lime-100";
    }
    return town
      ? "border-rose-300 bg-rose-100"
      : "border-amber-300 bg-amber-100";
  }
  if (type === "build") {
    return "border-teal-200 bg-teal-50";
  }
  return "border-stone-100 bg-white/80";
}

export function JournalPanel({
  refreshToken = 0,
  localLogs = [],
  onLocalLogsMatched,
  workBusy,
  activeWorkBuildingId,
  onAcceptWork,
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
            {displayLogs.map((entry) => {
              const p = entry.payload;
              const buildingId =
                typeof p.buildingId === "number" ? p.buildingId : null;
              const offerPending =
                entry.type === "work_offer" &&
                p.status !== "accepted" &&
                buildingId != null;
              const alreadyHere =
                offerPending && activeWorkBuildingId === buildingId;
              return (
                <li
                  key={entry.id}
                  className={`rounded-lg border px-2 py-1.5 ${logCardClass(entry)}`}
                >
                  <p className="text-[11px] leading-snug text-stone-800">
                    {formatActivity(entry)}
                  </p>
                  {offerPending && onAcceptWork ? (
                    <button
                      type="button"
                      disabled={workBusy || alreadyHere}
                      onClick={() => onAcceptWork(buildingId)}
                      className="mt-1.5 rounded border border-sky-500 bg-sky-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {alreadyHere ? "Working" : "Work"}
                    </button>
                  ) : null}
                  <p className="mt-0.5 text-[10px] text-stone-400">
                    {formatTime(entry.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
