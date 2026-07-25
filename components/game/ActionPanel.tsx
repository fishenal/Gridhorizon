"use client";

import type { ViewportTile } from "./MapCanvas";

type Props = {
  selected: { x: number; y: number } | null;
  tile: ViewportTile | undefined;
  playerId: number;
  friends: Array<{ id: number; name: string; x: number; y: number }>;
  busy: boolean;
  message: string;
  onMessageChange: (v: string) => void;
  onTravel: () => void;
  onBuild: (action: string) => void;
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
  message,
  onMessageChange,
  onTravel,
  onBuild,
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
        <h2 className="font-semibold">选中格子</h2>
        {!selected ? (
          <p className="text-stone-500">点击地图选择目标</p>
        ) : (
          <div className="mt-1 space-y-1">
            <p>
              ({selected.x}, {selected.y})
            </p>
            {clear ? (
              <>
                <p>
                  {clear.isLand ? clear.terrain : "ocean"}
                  {clear.resourceType !== "none"
                    ? ` · 资源 ${clear.resourceType}`
                    : ""}
                </p>
                {clear.building ? (
                  <p>
                    建筑 {clear.building.type}
                    {clear.building.message
                      ? `「${clear.building.message}」`
                      : ""}
                  </p>
                ) : null}
                {clear.claim ? (
                  <p>占领者 #{clear.claim.ownerId}</p>
                ) : null}
              </>
            ) : (
              <p className="text-stone-500">迷雾中</p>
            )}
            <button
              type="button"
              disabled={busy || !selected}
              onClick={onTravel}
              className="mt-2 w-full rounded bg-teal-900 px-3 py-2 text-white disabled:opacity-50"
            >
              行进到此处
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">建设（需站在本格）</h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["claim", "声明土地"],
              ["mine", "矿场 500金"],
              ["farm", "农场"],
              ["fishery", "渔场"],
              ["town", "城镇"],
              ["waypoint", "路标 100金"],
            ] as const
          ).map(([action, label]) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onBuild(action)}
              className="rounded border border-stone-300 bg-white px-2 py-1.5 hover:bg-stone-50 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block text-xs text-stone-600">
          路标留言
          <input
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1"
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            maxLength={200}
          />
        </label>
      </section>

      {clear && !clear.fog && clear.claim && clear.claim.ownerId !== playerId ? (
        <section>
          <h2 className="font-semibold">求购此地</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => onBuyLand(clear.claim!.ownerId)}
            className="mt-1 rounded border border-stone-300 px-3 py-1.5"
          >
            出价 100 金求购
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="font-semibold">好友</h2>
        {friends.length === 0 ? (
          <p className="text-stone-500">视野内相遇会自动加好友</p>
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
                  卖木×5 / 10金
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">资源交易</h2>
        {tradeOffers.length === 0 ? (
          <p className="text-stone-500">暂无进行中的报价</p>
        ) : (
          <ul className="space-y-2">
            {tradeOffers.map((o) => (
              <li key={o.id} className="rounded border border-stone-200 p-2">
                <p>
                  #{o.id} {o.kind} {o.amount} {o.resource} / {o.priceGold}金
                </p>
                <div className="mt-1 flex gap-2">
                  {o.toPlayerId === playerId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRespondTrade(o.id, "accept")}
                      >
                        同意
                      </button>
                      <button
                        type="button"
                        onClick={() => onRespondTrade(o.id, "reject")}
                      >
                        拒绝
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRespondTrade(o.id, "cancel")}
                    >
                      取消
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">地块求购</h2>
        {landOffers.length === 0 ? (
          <p className="text-stone-500">暂无</p>
        ) : (
          <ul className="space-y-2">
            {landOffers.map((o) => (
              <li key={o.id} className="rounded border border-stone-200 p-2">
                <p>
                  ({o.x},{o.y}) · {o.priceGold}金
                </p>
                <div className="mt-1 flex gap-2">
                  {o.toPlayerId === playerId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRespondLand(o.id, "accept")}
                      >
                        同意出售
                      </button>
                      <button
                        type="button"
                        onClick={() => onRespondLand(o.id, "reject")}
                      >
                        拒绝
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRespondLand(o.id, "cancel")}
                    >
                      取消
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
