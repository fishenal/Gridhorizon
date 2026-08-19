"use client";

import {
  RESOURCE_EMOJI,
  type ResourcePart,
} from "@/lib/game/resources";

type Props = {
  parts: ResourcePart[];
  skipZero?: boolean;
  className?: string;
};

export function ResourceRow({
  parts,
  skipZero = true,
  className = "",
}: Props) {
  const items = parts.filter(([, n]) => !skipZero || n !== 0);

  return (
    <div className={`grid grid-cols-3 gap-x-2 gap-y-1 ${className}`}>
      {items.map(([id, n]) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
        >
          {id === "xp" ? (
            <span className="text-[10px] font-semibold tracking-wide text-stone-500">
              xp
            </span>
          ) : (
            <span aria-hidden>{RESOURCE_EMOJI[id]}</span>
          )}
          <span>{n}</span>
        </span>
      ))}
    </div>
  );
}
