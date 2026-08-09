"use client";

import type { ViewportTile } from "./MapCanvas";

type Props = {
  selected: { x: number; y: number } | null;
  tile: ViewportTile | undefined;
  playerId: number;
  friends: Array<{ id: number; name: string; x: number; y: number }>;
  busy: boolean;
  onTravel: () => void;
  onTrade: (toPlayerId: number) => void;
  onBuyLand: (ownerId: number) => void;
  tradeOffers: Array<{
    id: number;
    fromPlayerId: number;
    toPlayerId: number;
    kind: string;
    resource: string;
    amount: number;
    priceGold: number;
  }>;
  landOffers: Array<{
    id: number;
    fromPlayerId: number;
    toPlayerId: number;
    x: number;
    y: number;
    priceGold: number;
  }>;
  onRespondTrade: (offerId: number, action: "accept" | "reject" | "cancel") => void;
  onRespondLand: (offerId: number, action: "accept" | "reject" | "cancel") => void;
};

export function ActionPanel({
  selected,
  tile,
  playerId,
  friends,
  busy,
  onTravel,
  onTrade,
  onBuyLand,
  tradeOffers,
  landOffers,
  onRespondTrade,
  onRespondLand,
}: Props) {
  const clear =
    tile && !tile.fog
      ? tile
      : null;

  return (
    <aside className="flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-l border-stone-300/80 bg-white/80 p-4 text-sm">
      <section>
        <h2 className="font-semibold">Selected tile</h2>
        {!selected ? (
          <p className="text-stone-500">Click the map to select a target</p>
        ) : (
          <div className="mt-1 space-y-1">
            <p>
              ({selected.x}, {selected.y})
            </p>
            {clear ? (
              <>
                <p>
                  {clear.isLand
                    ? (
                        {
                          grass: "Grassland",
                          forest: "Forest",
                          mountain: "Mountains",
                          desert: "Desert / beach",
                          water: "Water",
                        } as Record<string, string>
                      )[clear.terrain] ?? clear.terrain
                    : "Water"}
                  {clear.resourceType !== "none"
                    ? ` · Resource ${clear.resourceType}`
                    : ""}
                </p>
                {clear.building ? (
                  <p>
                    Building{" "}
                    {(
                      {
                        flag: "Flag",
                        waypoint: "Flag",
                        town: "Town",
                      } as Record<string, string>
                    )[clear.building.type] ?? clear.building.type}
                    {clear.building.name || clear.building.message
                      ? ` "${clear.building.name ?? clear.building.message}"`
                      : ""}
                  </p>
                ) : null}
                {clear.claim ? (
                  <p>Owner #{clear.claim.ownerId}</p>
                ) : null}
              </>
            ) : (
              <p className="text-stone-500">In fog</p>
            )}
            <button
              type="button"
              disabled={busy || !selected}
              onClick={onTravel}
              className="mt-2 w-full rounded bg-teal-900 px-3 py-2 text-white disabled:opacity-50"
            >
              Travel here
            </button>
          </div>
        )}
      </section>

      {clear && !clear.fog && clear.claim && clear.claim.ownerId !== playerId ? (
        <section>
          <h2 className="font-semibold">Buy this land</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => onBuyLand(clear.claim!.ownerId)}
            className="mt-1 rounded border border-stone-300 px-3 py-1.5"
          >
            Offer 100 gold
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="font-semibold">Friends</h2>
        {friends.length === 0 ? (
          <p className="text-stone-500">
            Players you meet in vision are added as friends automatically
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span>
                  {f.name} ({f.x},{f.y})
                </span>
                <button
                  type="button"
                  className="text-teal-800 underline"
                  onClick={() => onTrade(f.id)}
                  disabled={busy}
                >
                  Sell wood ×5 / 10 gold
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Resource trades</h2>
        {tradeOffers.length === 0 ? (
          <p className="text-stone-500">No open offers</p>
        ) : (
          <ul className="space-y-2">
            {tradeOffers.map((o) => (
              <li key={o.id} className="rounded border border-stone-200 p-2">
                <p>
                  #{o.id} {o.kind} {o.amount} {o.resource} / {o.priceGold} gold
                </p>
                <div className="mt-1 flex gap-2">
                  {o.toPlayerId === playerId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRespondTrade(o.id, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onRespondTrade(o.id, "reject")}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRespondTrade(o.id, "cancel")}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Land offers</h2>
        {landOffers.length === 0 ? (
          <p className="text-stone-500">None</p>
        ) : (
          <ul className="space-y-2">
            {landOffers.map((o) => (
              <li key={o.id} className="rounded border border-stone-200 p-2">
                <p>
                  ({o.x},{o.y}) · {o.priceGold} gold
                </p>
                <div className="mt-1 flex gap-2">
                  {o.toPlayerId === playerId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRespondLand(o.id, "accept")}
                      >
                        Accept sale
                      </button>
                      <button
                        type="button"
                        onClick={() => onRespondLand(o.id, "reject")}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRespondLand(o.id, "cancel")}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
