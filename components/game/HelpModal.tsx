"use client";

import { useEffect, useId, type ReactNode } from "react";
import { BUILD_CATALOG } from "@/lib/game/buildCatalog";
import {
  buildingEmoji,
  STRUCTURE_INFLUENCE_SIDE,
} from "@/lib/game/playerStyle";
import {
  INITIAL_GOLD,
  PRODUCER_GRANT,
  TOWN_POP_GRANT,
  TOWN_TOLL,
  VISION_RADIUS,
  WAYPOINT_TOLL,
  WORK_GOLD_PER_MINUTE,
  WORK_OWNER_GRANT,
  XP_BUILD,
  XP_PER_STEP,
} from "@/lib/map/constants";
import { RESOURCE_EMOJI, RESOURCE_LABEL, formatAmounts, type ResourcePart } from "@/lib/game/resources";

type Props = {
  onClose: () => void;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function HelpModal({ onClose }: Props) {
  const titleId = useId();

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
        className="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div>
            <h2
              id={titleId}
              className="text-base font-semibold text-stone-900"
            >
              Help
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Resources, travel, and building.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-3 text-sm text-stone-700">
          <Section title="Resources">
            <ul className="space-y-2 text-xs leading-relaxed">
              <li>
                <span className="font-medium text-stone-800">
                  {RESOURCE_EMOJI.gold} {RESOURCE_LABEL.gold}
                </span>
                {" — "}
                earned by walking (+{XP_PER_STEP} per tile). Spent to build.
                New travelers start with {INITIAL_GOLD}.
              </li>
              <li>
                <span className="font-medium text-stone-800">
                  {RESOURCE_EMOJI.stone} {RESOURCE_LABEL.stone}
                </span>
                {" — "}
                granted instantly when you build a Quarry {buildingEmoji("mine")}{" "}
                (+{PRODUCER_GRANT}).
              </li>
              <li>
                <span className="font-medium text-stone-800">
                  {RESOURCE_EMOJI.wood} {RESOURCE_LABEL.wood}
                </span>
                {" — "}
                granted instantly when you build a Lumber camp{" "}
                {buildingEmoji("lumber")} (+{PRODUCER_GRANT}).
              </li>
              <li>
                <span className="font-medium text-stone-800">
                  {RESOURCE_EMOJI.food} {RESOURCE_LABEL.food}
                </span>
                {" — "}
                granted instantly when you build a Farm {buildingEmoji("farm")}{" "}
                (+{PRODUCER_GRANT}).
              </li>
              <li>
                <span className="font-medium text-stone-800">
                  {RESOURCE_EMOJI.population} {RESOURCE_LABEL.population}
                </span>
                {" — "}
                granted instantly when you build a Town {buildingEmoji("town")}{" "}
                (+{TOWN_POP_GRANT}). Endgame score.
              </li>
              <li>
                <span className="font-medium text-stone-800">xp</span>
                {" — "}
                never decreases. +{XP_PER_STEP} per tile walked, +{XP_BUILD}{" "}
                per building, and +1 xp per gold paid or received as a toll.
              </li>
              <li>
                <span className="font-medium text-stone-800">🗺️</span>
                {" — "}
                public score: share of the 8000×8000 world you have revealed.
                Visible on your card and on other travelers.
              </li>
            </ul>
          </Section>

          <Section title="Movement">
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed">
              <li>Click the map to pathfind. Travel continues even while you are offline.</li>
              <li>
                Each tile walked grants +{XP_PER_STEP} {RESOURCE_EMOJI.gold}{" "}
                and +{XP_PER_STEP} xp.
              </li>
              <li>
                Flag {buildingEmoji("flag")} and Town {buildingEmoji("town")}{" "}
                own a {STRUCTURE_INFLUENCE_SIDE}×{STRUCTURE_INFLUENCE_SIDE}{" "}
                influence zone. A flag charges{" "}
                {formatAmounts([["gold", WAYPOINT_TOLL]])} when you enter;
                a town charges {formatAmounts([["gold", TOWN_TOLL]])} for
                drinking and reveling. You only pay if you can afford it.
                Payer and owner both gain that much xp.
              </li>
              <li>
                Vision radius is {VISION_RADIUS} tiles. Fog stays lifted on
                tiles you have already seen.
              </li>
              <li>Stand on a tile to build there.</li>
              <li>
                Entering someone else’s Quarry, Farm, or Lumber camp (same{" "}
                {STRUCTURE_INFLUENCE_SIDE}×{STRUCTURE_INFLUENCE_SIDE} range)
                offers work. Stay to earn {WORK_GOLD_PER_MINUTE} gold per
                minute; the owner immediately gains {WORK_OWNER_GRANT} of that
                site’s resource. Leave the range or tap Stop working to quit.
                Several people can work the same site independently.
              </li>
            </ul>
          </Section>

          <Section title="Building">
            <p className="text-xs leading-relaxed">
              The tile must be empty (anyone’s building blocks it). Flags can
              go on water; everything else needs land. Resources are granted
              the moment you place the building — there is no timed production.
            </p>
            <div className="overflow-hidden rounded-lg border border-stone-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Build</th>
                    <th className="px-2 py-1.5 font-medium">Cost</th>
                    <th className="px-2 py-1.5 font-medium">Grant</th>
                  </tr>
                </thead>
                <tbody>
                  {BUILD_CATALOG.map((entry) => {
                    const grantParts = (
                      [
                        ["stone", entry.grant.stone ?? 0],
                        ["wood", entry.grant.wood ?? 0],
                        ["food", entry.grant.food ?? 0],
                        ["population", entry.grant.population ?? 0],
                      ] satisfies ResourcePart[]
                    ).filter(([, n]) => n > 0);
                    return (
                      <tr
                        key={entry.id}
                        className="border-t border-stone-100"
                      >
                        <td className="px-2 py-1.5">
                          <span className="mr-1" aria-hidden>
                            {entry.icon}
                          </span>
                          {entry.label}
                          <span className="mt-0.5 block text-[10px] text-stone-400">
                            {entry.id === "flag" ? "Any tile" : "Land only"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-stone-600">
                          {entry.costLabel}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-stone-600">
                          {grantParts.length > 0
                            ? formatAmounts(grantParts)
                            : "—"}
                          <span className="mt-0.5 block text-[10px] text-stone-400">
                            +{XP_BUILD} xp
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-500">
              One quarry + farm + lumber camp supplies the materials for one
              town.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
