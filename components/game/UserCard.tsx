"use client";

import { useEffect, useState } from "react";
import type { Terrain } from "@/lib/map/generator";
import { FLAG_COST } from "@/lib/map/constants";
import {
  AVATAR_EMOJI_CHOICES,
  FLAG_RANGE_RADIUS,
  influenceSide,
  normalizeBubble,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import type { SelectedFlag, SelectedTown } from "@/components/game/MapCanvas";

export type BuildKind = "flag" | "town";

const BUBBLE_MAX = 300;

type Props = {
  name: string;
  playerId: number;
  emoji?: string;
  bubble?: string;
  gold?: number;
  xp?: number;
  x: number;
  y: number;
  isSelf: boolean;
  terrain?: Terrain;
  tileOccupied?: boolean;
  /** True when a known flag/town is within the 20×20 spacing rule */
  tooCloseToStructure?: boolean;
  busy?: boolean;
  onBuildSelect?: (kind: BuildKind) => void;
  onEmojiChange?: (emoji: string) => void;
  onBubbleChange?: (bubble: string) => void;
};

const TYPE_LABEL: Record<string, string> = {
  flag: "Flag",
  waypoint: "Flag",
  town: "Town",
};

function buildOptions(terrain: Terrain | undefined): BuildKind[] {
  const opts: BuildKind[] = ["flag"];
  if (terrain === "grass") opts.unshift("town");
  return opts;
}

function EmojiFace({ emoji, size = 40 }: { emoji: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center leading-none"
      style={{ fontSize: size * 0.7 }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

export function UserCard({
  name,
  emoji,
  bubble,
  gold,
  xp,
  x,
  y,
  isSelf,
  terrain,
  tileOccupied,
  tooCloseToStructure,
  busy,
  onBuildSelect,
  onEmojiChange,
  onBubbleChange,
}: Props) {
  const options = isSelf && onBuildSelect ? buildOptions(terrain) : [];
  const face = normalizePlayerEmoji(emoji);
  const [draft, setDraft] = useState(() => normalizeBubble(bubble));

  useEffect(() => {
    setDraft(normalizeBubble(bubble));
  }, [bubble]);

  const saveBubble = () => {
    if (!onBubbleChange) return;
    const next = normalizeBubble(draft);
    if (next === normalizeBubble(bubble)) return;
    onBubbleChange(next);
  };

  return (
    <div className="pointer-events-auto w-48 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <EmojiFace emoji={face} />
        <p className="truncate text-sm font-medium text-pink-600">{name}</p>
      </div>
      <p className="text-sm text-pink-600">
        Coords: ({x}, {y})
      </p>
      {isSelf ? (
        <>
          <p className="text-sm text-pink-600">Gold: {gold ?? 0}</p>
          <p className="mb-2 text-sm text-pink-600">XP: {xp ?? 0}</p>
          {onEmojiChange ? (
            <div className="mb-2 border-t border-stone-100 pt-2">
              <p className="mb-1 text-[11px] text-stone-500">Avatar</p>
              <div className="flex flex-wrap gap-1">
                {AVATAR_EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    disabled={busy}
                    onClick={() => onEmojiChange(e)}
                    className={`flex h-7 w-7 items-center justify-center text-sm disabled:opacity-40 ${
                      e === face
                        ? "bg-pink-50 ring-1 ring-pink-400"
                        : "hover:bg-stone-50"
                    }`}
                    aria-label={`Choose ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {onBubbleChange ? (
            <div className="mb-2 border-t border-stone-100 pt-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] text-stone-500">Bubble</p>
                <p className="text-[10px] text-stone-400">
                  {draft.length}/{BUBBLE_MAX}
                </p>
              </div>
              <textarea
                value={draft}
                disabled={busy}
                maxLength={BUBBLE_MAX}
                rows={3}
                placeholder="Say something…"
                onChange={(e) =>
                  setDraft(e.target.value.slice(0, BUBBLE_MAX))
                }
                onBlur={saveBubble}
                className="w-full resize-none rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] text-stone-800 placeholder:text-stone-400 focus:border-pink-300 focus:outline-none disabled:opacity-40"
              />
              <button
                type="button"
                disabled={busy}
                onClick={saveBubble}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] text-stone-700 hover:bg-stone-100 disabled:opacity-40"
              >
                Save bubble
              </button>
            </div>
          ) : null}
          {tileOccupied ? (
            <p className="text-[11px] text-stone-500">
              This tile already has a building
            </p>
          ) : options.length > 0 ? (
            <div className="mt-1 space-y-1.5 border-t border-stone-100 pt-2">
              <p className="text-[11px] text-stone-500">Build</p>
              {tooCloseToStructure ? (
                <p className="text-[11px] text-red-600">
                  Too close to another flag or town (need 20×20 clear)
                </p>
              ) : (
                <p className="text-[10px] text-stone-400">
                  One flag/town per 20×20 area
                </p>
              )}
              {options.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={busy || tooCloseToStructure}
                  onClick={() => onBuildSelect?.(kind)}
                  className="w-full rounded-lg border border-pink-300 bg-white px-2 py-1.5 text-sm text-pink-700 hover:bg-pink-100 disabled:opacity-40"
                >
                  {kind === "flag" ? `Flag (${FLAG_COST} gold)` : "Town"}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : bubble?.trim() ? (
        <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-snug text-stone-600">
          {normalizeBubble(bubble)}
        </p>
      ) : null}
    </div>
  );
}

export { TYPE_LABEL };

type FlagCardProps = {
  flag: SelectedFlag;
};

function formatCreatedAt(iso: string | null) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FlagCard({ flag }: FlagCardProps) {
  const side = influenceSide(flag.tollRadius ?? FLAG_RANGE_RADIUS);
  const ownerEmoji = normalizePlayerEmoji(flag.ownerEmoji);
  return (
    <div className="pointer-events-auto w-48 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <EmojiFace emoji="🚩" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-pink-600">
            {flag.name}
          </p>
          <p className="truncate text-[11px] text-stone-500">Flag</p>
        </div>
      </div>
      <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-stone-600">
        <span className="text-base leading-none" aria-hidden>
          {ownerEmoji}
        </span>
        <span className="truncate">Owner · {flag.ownerName}</span>
      </div>
      <p className="text-sm text-pink-600">
        Coords: ({flag.x}, {flag.y})
      </p>
      <p className="text-sm text-pink-600">
        Created: {formatCreatedAt(flag.createdAt)}
      </p>
      <p className="mt-1 text-[11px] text-stone-500">
        Influence {side}×{side} (centered on flag)
      </p>
    </div>
  );
}

type TownCardProps = {
  town: SelectedTown;
};

export function TownCard({ town }: TownCardProps) {
  const ownerEmoji = normalizePlayerEmoji(town.ownerEmoji);
  const side = influenceSide(town.tollRadius ?? FLAG_RANGE_RADIUS);
  return (
    <div className="pointer-events-auto w-48 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <EmojiFace emoji="🏘️" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-pink-600">
            {town.name}
          </p>
          <p className="truncate text-[11px] text-stone-500">Town</p>
        </div>
      </div>
      <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-stone-600">
        <span className="text-base leading-none" aria-hidden>
          {ownerEmoji}
        </span>
        <span className="truncate">Owner · {town.ownerName}</span>
      </div>
      <p className="text-sm text-pink-600">
        Coords: ({town.x}, {town.y})
      </p>
      <p className="text-sm text-pink-600">Level: {town.level}</p>
      <p className="text-sm text-pink-600">
        Created: {formatCreatedAt(town.createdAt)}
      </p>
      <p className="mt-1 text-[11px] text-stone-500">
        Influence {side}×{side} (centered on town)
      </p>
    </div>
  );
}

type DialogProps = {
  kind: BuildKind;
  busy?: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

export function BuildNameDialog({
  kind,
  busy,
  onConfirm,
  onCancel,
}: DialogProps) {
  const [value, setValue] = useState("");
  const title = kind === "flag" ? "Build flag" : "Build town";
  const trimmed = value.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 24;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4">
      <div
        className="w-full max-w-xs rounded-xl border border-stone-200 bg-white p-4 shadow-xl"
        role="dialog"
        aria-labelledby="build-name-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="build-name-title"
          className="text-base font-semibold text-stone-800"
        >
          {title}
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Enter a name (1–24 characters)
        </p>
        <input
          autoFocus
          className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          value={value}
          maxLength={24}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !busy) onConfirm(trimmed);
            if (e.key === "Escape") onCancel();
          }}
          placeholder={kind === "flag" ? "Flag name" : "Town name"}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-lg border border-stone-300 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => onConfirm(trimmed)}
            className="flex-1 rounded-lg bg-stone-900 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
