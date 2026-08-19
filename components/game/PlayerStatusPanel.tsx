"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountSettingsModal } from "@/components/game/AccountSettingsModal";
import {
  buildingEmoji,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import { ExploredStat } from "@/components/game/ExploredStat";
import { ResourceRow } from "@/components/game/ResourceRow";
import { isDeviceGuest } from "@/lib/game/guestIdentity";

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
    bubble?: string;
    gold: number;
    xp?: number;
    exploredCells?: number;
    stone?: number;
    wood?: number;
    food?: number;
    population?: number;
    x: number;
    y: number;
    status?: string;
  };
  working?: boolean;
  busy?: boolean;
  refreshToken?: number;
  onStopWork?: () => void;
  onNameChange?: (name: string) => void;
  onEmojiChange?: (emoji: string) => void;
  onBubbleChange?: (bubble: string) => void;
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

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H19a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function PlayerStatusPanel({
  player,
  working = false,
  refreshToken = 0,
  busy,
  onStopWork,
  onNameChange,
  onEmojiChange,
  onBubbleChange,
}: Props) {
  const [buildings, setBuildings] = useState<OwnedBuilding[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guest, setGuest] = useState(false);
  const face = normalizePlayerEmoji(player.emoji);

  useEffect(() => {
    setGuest(isDeviceGuest(player.name));
  }, [player.name, settingsOpen]);

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
    <>
      <div className="pointer-events-auto flex w-[216px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
        <div className="border-b border-stone-200 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-xl leading-none" aria-hidden>
              {face}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">
              {player.name}
            </p>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title={guest ? "Save login" : "Account settings"}
              aria-label={guest ? "Save login" : "Account settings"}
              className="shrink-0 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            >
              <GearIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <ResourceRow
            className="mt-1.5 text-[11px] leading-snug text-stone-700"
            skipZero={false}
            parts={[
              ["gold", player.gold],
              ["stone", player.stone ?? 0],
              ["wood", player.wood ?? 0],
              ["food", player.food ?? 0],
              ["population", player.population ?? 0],
              ["xp", player.xp ?? 0],
            ]}
          />
          <ExploredStat
            className="mt-1 text-[11px] leading-snug text-stone-700"
            cells={player.exploredCells}
          />
          <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-stone-500">
            <span>
              ({player.x},{player.y})
            </span>
            {player.status === "traveling" ? <span>· moving</span> : null}
            {working ? (
              <>
                <span>· working</span>
                {onStopWork ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onStopWork}
                    className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    Stop working
                  </button>
                ) : null}
              </>
            ) : null}
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
      </div>

      {settingsOpen ? (
        <AccountSettingsModal
          currentName={player.name}
          emoji={player.emoji}
          bubble={player.bubble}
          busy={busy}
          onClose={() => setSettingsOpen(false)}
          onSaved={(name) => {
            setGuest(false);
            onNameChange?.(name);
          }}
          onEmojiChange={onEmojiChange}
          onBubbleChange={onBubbleChange}
        />
      ) : null}
    </>
  );
}
