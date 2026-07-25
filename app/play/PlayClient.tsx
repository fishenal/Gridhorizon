"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionPanel } from "@/components/game/ActionPanel";
import { Hud } from "@/components/game/Hud";
import { MapCanvas, type ViewportTile } from "@/components/game/MapCanvas";

type MeResponse = {
  player: {
    id: number;
    name: string;
    x: number;
    y: number;
    gold: number;
    stone: number;
    wood: number;
    ore: number;
    food: number;
    status: string;
  };
  travel: {
    etaSeconds: number;
    target: { x: number; y: number };
  } | null;
  friends: Array<{ id: number; name: string; x: number; y: number }>;
  config: { travelSecondsPerTile: number };
};

type ViewportResponse = {
  center: { x: number; y: number };
  player: { x: number; y: number; id: number; name: string };
  visionRadius: number;
  tiles: ViewportTile[];
  players: Array<{ id: number; name: string; x: number; y: number }>;
};

export default function PlayClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [viewport, setViewport] = useState<ViewportResponse | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tradeOffers, setTradeOffers] = useState<
    Array<{
      id: number;
      fromPlayerId: number;
      toPlayerId: number;
      kind: string;
      resource: string;
      amount: number;
      priceGold: number;
    }>
  >([]);
  const [landOffers, setLandOffers] = useState<
    Array<{
      id: number;
      fromPlayerId: number;
      toPlayerId: number;
      x: number;
      y: number;
      priceGold: number;
    }>
  >([]);

  const refresh = useCallback(async () => {
    const [meRes, tradeRes, landRes] = await Promise.all([
      fetch("/api/me"),
      fetch("/api/trade"),
      fetch("/api/land"),
    ]);
    if (meRes.status === 401) {
      window.location.href = "/login";
      return;
    }
    const meData = (await meRes.json()) as MeResponse;
    setMe(meData);

    const vpRes = await fetch(
      `/api/map/viewport?x=${meData.player.x}&y=${meData.player.y}`,
    );
    const vpData = (await vpRes.json()) as ViewportResponse;
    setViewport(vpData);

    if (tradeRes.ok) {
      const t = await tradeRes.json();
      setTradeOffers(t.offers ?? []);
    }
    if (landRes.ok) {
      const l = await landRes.json();
      setLandOffers(l.offers ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const selectedTile = useMemo(() => {
    if (!selected || !viewport) return undefined;
    return viewport.tiles.find(
      (t) => t.x === selected.x && t.y === selected.y,
    );
  }, [selected, viewport]);

  async function onTravel() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/travel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: selected.x, y: selected.y }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "行进失败");
      return;
    }
    await refresh();
  }

  async function onBuild(action: string) {
    if (!me) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        x: me.player.x,
        y: me.player.y,
        message: action === "waypoint" ? message : undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "建设失败");
      return;
    }
    await refresh();
  }

  async function onTrade(toPlayerId: number) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        toPlayerId,
        kind: "sell",
        resource: "wood",
        amount: 5,
        priceGold: 10,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error ?? "交易失败");
    await refresh();
  }

  async function onBuyLand(ownerId: number) {
    if (!selected) return;
    setBusy(true);
    const res = await fetch("/api/land", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        toPlayerId: ownerId,
        x: selected.x,
        y: selected.y,
        priceGold: 100,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error ?? "求购失败");
    await refresh();
  }

  async function onRespondTrade(
    offerId: number,
    action: "accept" | "reject" | "cancel",
  ) {
    setBusy(true);
    await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, offerId }),
    });
    setBusy(false);
    await refresh();
  }

  async function onRespondLand(
    offerId: number,
    action: "accept" | "reject" | "cancel",
  ) {
    setBusy(true);
    await fetch("/api/land", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, offerId }),
    });
    setBusy(false);
    await refresh();
  }

  if (!me || !viewport) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center text-stone-600">
        加载世界中…
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-1 flex-col">
      <Hud
        player={me.player}
        travel={me.travel}
        travelSecondsPerTile={me.config.travelSecondsPerTile}
        onSignOut={() => signOut({ callbackUrl: "/" })}
      />
      {error ? (
        <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex flex-1 items-center justify-center overflow-auto p-4">
          <MapCanvas
            tiles={viewport.tiles}
            center={viewport.center}
            player={{
              x: viewport.player.x,
              y: viewport.player.y,
              id: viewport.player.id,
            }}
            others={viewport.players}
            visionRadius={viewport.visionRadius}
            selected={selected}
            onSelect={(x, y) => setSelected({ x, y })}
          />
        </div>
        <ActionPanel
          selected={selected}
          tile={selectedTile}
          playerId={me.player.id}
          friends={me.friends}
          busy={busy}
          message={message}
          onMessageChange={setMessage}
          onTravel={onTravel}
          onBuild={onBuild}
          onTrade={onTrade}
          onBuyLand={onBuyLand}
          tradeOffers={tradeOffers}
          landOffers={landOffers}
          onRespondTrade={onRespondTrade}
          onRespondLand={onRespondLand}
        />
      </div>
    </main>
  );
}
