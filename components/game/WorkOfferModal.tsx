"use client";

import { useEffect, useState } from "react";
import { buildingEmoji, normalizePlayerEmoji } from "@/lib/game/playerStyle";
import {
  WORK_GOLD_PER_MINUTE,
  WORK_OWNER_GRANT,
} from "@/lib/map/constants";
import { RESOURCE_EMOJI } from "@/lib/game/resources";
import {
  workplaceLabel,
  workResourceForType,
  type WorkplaceWorker,
} from "@/lib/game/workplaceMeta";

export type WorkOffer = {
  buildingId: number;
  buildingType: string;
  buildingName: string | null;
  ownerName: string;
  x: number;
  y: number;
  radius: number;
};

type Props = {
  offer: WorkOffer;
  busy?: boolean;
  onWork: () => void;
  onCancel: () => void;
};

export function WorkOfferModal({ offer, busy, onWork, onCancel }: Props) {
  const [workers, setWorkers] = useState<WorkplaceWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const resource = workResourceForType(offer.buildingType);
  const place =
    offer.buildingName?.trim() || workplaceLabel(offer.buildingType);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/work", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "workers",
            buildingId: offer.buildingId,
          }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { workers?: WorkplaceWorker[] };
        if (!cancelled) setWorkers(data.workers ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offer.buildingId]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[180] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-xl"
        role="dialog"
        aria-labelledby="work-offer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none" aria-hidden>
            {buildingEmoji(offer.buildingType)}
          </span>
          <h2
            id="work-offer-title"
            className="text-base font-semibold text-stone-900"
          >
            {workplaceLabel(offer.buildingType)}
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          You have entered {offer.ownerName}&apos;s {place}. Stay and work here?
          You earn {WORK_GOLD_PER_MINUTE} gold per minute. The owner gains{" "}
          {WORK_OWNER_GRANT}
          {resource ? ` ${RESOURCE_EMOJI[resource]}` : ""} immediately.
        </p>

        <div className="mt-3 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
          <p className="text-[11px] font-medium text-stone-500">
            Working here now
          </p>
          {loading ? (
            <p className="mt-1 text-[11px] text-stone-400">Loading…</p>
          ) : workers.length === 0 ? (
            <p className="mt-1 text-[11px] text-stone-400">Nobody yet</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {workers.map((w) => (
                <li
                  key={w.playerId}
                  className="flex items-center gap-1.5 text-[11px] text-stone-700"
                >
                  <span aria-hidden>{normalizePlayerEmoji(w.emoji)}</span>
                  <span className="truncate">{w.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onWork}
            className="flex-1 rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Work
          </button>
        </div>
      </div>
    </div>
  );
}
