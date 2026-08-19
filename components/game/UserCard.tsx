"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
import {
  BUILDING_NAME_MAX,
  isNamedBuildKind,
  suggestedBuildingName,
} from "@/lib/game/buildingName";
import { ExploredStat } from "@/components/game/ExploredStat";
import { ResourceRow } from "@/components/game/ResourceRow";
import type { SelectedFlag, SelectedTown } from "@/components/game/MapCanvas";
import { FLAG_TOLL, TOWN_TOLL } from "@/lib/map/constants";

export type { BuildKind };

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
  gold?: number;
  xp?: number;
  exploredCells?: number;
  stone?: number;
  wood?: number;
  food?: number;
  population?: number;
  x: number;
  y: number;
  isLand?: boolean;
  tileOccupied?: boolean;
  busy?: boolean;
  onBuildSelect?: (kind: BuildKind) => void;
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
  const hint = ctx.occupied
    ? "This tile already has a building"
    : "Tap an icon to build on this tile";

  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-snug text-stone-500">{hint}</p>
      <div className="grid grid-cols-2 gap-1.5">
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
              {entry.costLabel ? (
                <span className="text-center text-[9px] leading-tight text-stone-500">
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

/** Self card: build tools for the selected tile (no profile tabs). */
export function SelfToolCard({
  name,
  emoji,
  gold,
  xp,
  exploredCells,
  stone,
  wood,
  food,
  population,
  x,
  y,
  isLand = true,
  tileOccupied,
  busy,
  onBuildSelect,
}: SelfToolCardProps) {
  const face = normalizePlayerEmoji(emoji);

  const buildCtx = useMemo<BuildAvailabilityContext>(
    () => ({
      isLand,
      occupied: Boolean(tileOccupied),
      gold: gold ?? 0,
      stone: stone ?? 0,
      wood: wood ?? 0,
      food: food ?? 0,
      population: population ?? 0,
    }),
    [isLand, tileOccupied, gold, stone, wood, food, population],
  );

  return (
    <div className="pointer-events-auto flex w-56 max-h-[min(360px,75vh)] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="shrink-0 border-b border-stone-100 p-3 pb-2">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <EmojiFace emoji={face} size={32} />
          <p className="truncate text-sm font-medium text-pink-600">{name}</p>
        </div>
        <p className="text-[11px] leading-snug text-pink-600">
          ({x}, {y})
        </p>
        <ResourceRow
          className="text-[11px] leading-snug text-stone-700"
          skipZero={false}
          parts={[
            ["gold", gold ?? 0],
            ["stone", stone ?? 0],
            ["wood", wood ?? 0],
            ["food", food ?? 0],
            ["population", population ?? 0],
            ["xp", xp ?? 0],
          ]}
        />
        <ExploredStat
          className="mt-1 text-[11px] leading-snug text-stone-700"
          cells={exploredCells}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {onBuildSelect ? (
          <BuildGrid ctx={buildCtx} busy={busy} onSelect={onBuildSelect} />
        ) : (
          <p className="text-[11px] text-stone-400">No build actions</p>
        )}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  flag: "Flag",
  waypoint: "Flag",
  town: "Town",
  mine: "Quarry",
  farm: "Farm",
  lumber: "Lumber",
  fishery: "Fishery",
};

export { TYPE_LABEL };

type FlagCardProps = {
  flag: SelectedFlag;
  canRename?: boolean;
  renaming?: boolean;
  onRename?: (name: string) => void;
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

function RenameField({
  currentName,
  busy,
  onRename,
}: {
  currentName: string;
  busy?: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    setValue(currentName);
  }, [currentName]);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setEditing(true)}
        className="mt-2 w-full rounded-lg border border-stone-200 py-1 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-50"
      >
        Rename
      </button>
    );
  }

  const trimmed = value.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= BUILDING_NAME_MAX;

  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || busy) return;
        onRename(trimmed);
        setEditing(false);
      }}
    >
      <input
        autoFocus
        maxLength={BUILDING_NAME_MAX}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-900"
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => {
            setValue(currentName);
            setEditing(false);
          }}
          className="flex-1 rounded border border-stone-200 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !valid}
          className="flex-1 rounded bg-stone-900 py-1 text-[11px] text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}

export function FlagCard({
  flag,
  canRename,
  renaming,
  onRename,
}: FlagCardProps) {
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
        Influence {side}×{side} · {FLAG_TOLL} gold toll
      </p>
      {canRename && onRename ? (
        <RenameField
          currentName={flag.name}
          busy={renaming}
          onRename={onRename}
        />
      ) : null}
    </div>
  );
}

type TownCardProps = {
  town: SelectedTown;
  canRename?: boolean;
  renaming?: boolean;
  onRename?: (name: string) => void;
};

export function TownCard({
  town,
  canRename,
  renaming,
  onRename,
}: TownCardProps) {
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
        Influence {side}×{side} · {TOWN_TOLL} gold (drinking)
      </p>
      {canRename && onRename ? (
        <RenameField
          currentName={town.name}
          busy={renaming}
          onRename={onRename}
        />
      ) : null}
    </div>
  );
}

type DialogProps = {
  kind: BuildKind;
  ownerName: string;
  busy?: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

export function BuildNameDialog({
  kind,
  ownerName,
  busy,
  onConfirm,
  onCancel,
}: DialogProps) {
  const named = isNamedBuildKind(kind);
  const [value, setValue] = useState(() =>
    named ? suggestedBuildingName(ownerName) : "",
  );
  const title =
    kind === "flag"
      ? "Build flag"
      : kind === "town"
        ? "Build town"
        : `Build ${kind}`;

  const trimmed = value.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= BUILDING_NAME_MAX;

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
          Suggested place name — edit if you like (1–{BUILDING_NAME_MAX}{" "}
          characters).
        </p>
        <input
          autoFocus
          className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
          value={value}
          maxLength={BUILDING_NAME_MAX}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter" && valid && !busy) onConfirm(trimmed);
            if (e.key === "Escape") onCancel();
          }}
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
