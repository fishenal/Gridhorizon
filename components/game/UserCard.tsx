"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResourceType, Terrain } from "@/lib/map/generator";
import {
  AVATAR_EMOJI_CHOICES,
  FLAG_RANGE_RADIUS,
  influenceSide,
  normalizeBubble,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import {
  BUILD_CATALOG,
  getBuildAvailability,
  type BuildAvailabilityContext,
  type BuildKind,
} from "@/lib/game/buildCatalog";
import type { SelectedFlag, SelectedTown } from "@/components/game/MapCanvas";

export type { BuildKind };

const BUBBLE_MAX = 300;

type SelfTab = "profile" | "bubble" | "build";

const TAB_META: Record<
  SelfTab,
  { label: string; idle: string; active: string }
> = {
  profile: {
    label: "Profile",
    idle: "text-stone-500 hover:bg-stone-50",
    active: "bg-stone-100 text-stone-800 ring-1 ring-stone-300",
  },
  bubble: {
    label: "Bubble",
    idle: "text-pink-500 hover:bg-pink-50",
    active: "bg-pink-50 text-pink-700 ring-1 ring-pink-300",
  },
  build: {
    label: "Build",
    idle: "text-teal-600 hover:bg-teal-50",
    active: "bg-teal-50 text-teal-800 ring-1 ring-teal-300",
  },
};

type UserCardProps = {
  name: string;
  playerId: number;
  emoji?: string;
  bubble?: string;
  x: number;
  y: number;
};

type SelfToolCardProps = {
  name: string;
  emoji?: string;
  bubble?: string;
  gold?: number;
  xp?: number;
  x: number;
  y: number;
  terrain?: Terrain;
  isLand?: boolean;
  resourceType?: ResourceType;
  tileOccupied?: boolean;
  tooCloseToStructure?: boolean;
  claimedBySelf?: boolean;
  shore?: boolean;
  busy?: boolean;
  onBuildSelect?: (kind: BuildKind) => void;
  onEmojiChange?: (emoji: string) => void;
  onBubbleChange?: (bubble: string) => void;
};

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

function BuildGrid({
  ctx,
  busy,
  onSelect,
}: {
  ctx: BuildAvailabilityContext;
  busy?: boolean;
  onSelect: (kind: BuildKind) => void;
}) {
  const rows = BUILD_CATALOG.map((entry) => ({
    entry,
    avail: getBuildAvailability(entry.id, ctx),
  }));
  const flagReason = rows.find((r) => r.entry.id === "flag")?.avail;
  const hint = ctx.occupied
    ? "This tile already has a building"
    : flagReason && !flagReason.ok
      ? flagReason.reason
      : "Tap an icon to build on this tile";

  return (
    <div className="space-y-2">
      <p
        className={`text-[10px] leading-snug ${
          flagReason && !flagReason.ok ? "text-red-600" : "text-stone-500"
        }`}
      >
        {hint}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {rows.map(({ entry, avail }) => {
          const disabled = busy || !avail.ok;
          return (
            <button
              key={entry.id}
              type="button"
              disabled={disabled}
              title={avail.ok ? entry.label : (avail.reason ?? entry.label)}
              onClick={() => onSelect(entry.id)}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-teal-200 bg-white px-1 py-1.5 text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-50 disabled:text-stone-400 disabled:opacity-60"
            >
              <span className="text-lg leading-none" aria-hidden>
                {entry.icon}
              </span>
              <span className="text-[10px] font-medium leading-none">
                {entry.label}
              </span>
              {entry.costLabel ? (
                <span className="text-[9px] leading-none text-stone-400">
                  {entry.costLabel}
                </span>
              ) : (
                <span className="h-2.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Compact read-only card for other players. */
export function UserCard({ name, emoji, bubble, x, y }: UserCardProps) {
  const face = normalizePlayerEmoji(emoji);
  return (
    <div className="pointer-events-auto w-52 max-h-[min(320px,70vh)] overflow-y-auto rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <EmojiFace emoji={face} />
        <p className="truncate text-sm font-medium text-pink-600">{name}</p>
      </div>
      <p className="text-sm text-pink-600">
        Coords: ({x}, {y})
      </p>
      {bubble?.trim() ? (
        <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] leading-snug text-stone-600">
          {normalizeBubble(bubble)}
        </p>
      ) : null}
    </div>
  );
}

/** Self card: short header + Profile / Bubble / Build modes. */
export function SelfToolCard({
  name,
  emoji,
  bubble,
  gold,
  xp,
  x,
  y,
  terrain,
  isLand = true,
  resourceType = "none",
  tileOccupied,
  tooCloseToStructure,
  claimedBySelf,
  shore,
  busy,
  onBuildSelect,
  onEmojiChange,
  onBubbleChange,
}: SelfToolCardProps) {
  const [tab, setTab] = useState<SelfTab>("build");
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

  const buildCtx = useMemo<BuildAvailabilityContext>(
    () => ({
      terrain,
      isLand,
      resourceType,
      occupied: Boolean(tileOccupied),
      tooCloseToStructure: Boolean(tooCloseToStructure),
      gold: gold ?? 0,
      claimedBySelf: Boolean(claimedBySelf),
      shore: Boolean(shore),
    }),
    [
      terrain,
      isLand,
      resourceType,
      tileOccupied,
      tooCloseToStructure,
      gold,
      claimedBySelf,
      shore,
    ],
  );

  return (
    <div className="pointer-events-auto flex w-56 max-h-[min(320px,70vh)] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="shrink-0 p-3 pb-2">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <EmojiFace emoji={face} size={32} />
          <p className="truncate text-sm font-medium text-pink-600">{name}</p>
        </div>
        <p className="text-xs text-pink-600">
          ({x}, {y}) · {gold ?? 0}g · XP {xp ?? 0}
        </p>
      </div>

      <div className="shrink-0 grid grid-cols-3 gap-1 border-y border-stone-100 px-2 py-1.5">
        {(Object.keys(TAB_META) as SelfTab[]).map((key) => {
          const meta = TAB_META[key];
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-1 py-1 text-[11px] font-medium ${
                active ? meta.active : meta.idle
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-2">
        {tab === "profile" && onEmojiChange ? (
          <div>
            <p className="mb-1.5 text-[11px] text-stone-500">Avatar</p>
            <div className="flex flex-wrap gap-1">
              {AVATAR_EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={busy}
                  onClick={() => onEmojiChange(e)}
                  className={`flex h-7 w-7 items-center justify-center text-sm disabled:opacity-40 ${
                    e === face
                      ? "bg-stone-100 ring-1 ring-stone-400"
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

        {tab === "bubble" && onBubbleChange ? (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] text-stone-500">Message</p>
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
              onChange={(e) => setDraft(e.target.value.slice(0, BUBBLE_MAX))}
              onBlur={saveBubble}
              className="w-full resize-none rounded-lg border border-pink-200 bg-white px-2 py-1.5 text-[11px] text-stone-800 placeholder:text-stone-400 focus:border-pink-400 focus:outline-none disabled:opacity-40"
            />
            <button
              type="button"
              disabled={busy}
              onClick={saveBubble}
              className="mt-1.5 w-full rounded-lg border border-pink-200 bg-pink-50 px-2 py-1 text-[11px] text-pink-700 hover:bg-pink-100 disabled:opacity-40"
            >
              Save bubble
            </button>
          </div>
        ) : null}

        {tab === "build" && onBuildSelect ? (
          <BuildGrid
            ctx={buildCtx}
            busy={busy}
            onSelect={onBuildSelect}
          />
        ) : null}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  flag: "Flag",
  waypoint: "Flag",
  town: "Town",
};

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
    <div className="pointer-events-auto w-48 max-h-[min(320px,70vh)] overflow-y-auto rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
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
    <div className="pointer-events-auto w-48 max-h-[min(320px,70vh)] overflow-y-auto rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur">
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
  const title =
    kind === "flag"
      ? "Build flag"
      : kind === "town"
        ? "Build town"
        : `Build ${kind}`;
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
