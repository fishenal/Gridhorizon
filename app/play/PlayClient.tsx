"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud } from "@/components/game/Hud";
import {
  MapCanvas,
  type MapClickPayload,
  type ScreenAnchors,
  type SelectedEntity,
  type ViewportTile,
} from "@/components/game/MapCanvas";
import { MovePad, type TravelProgress } from "@/components/game/MovePad";
import { TilePopup } from "@/components/game/TilePopup";
import { UserCard } from "@/components/game/UserCard";
import { buildDirectionalPath, type Point } from "@/lib/game/path";
import {
  ingestExploredFromTiles,
  markVisionExplored,
  overlaysFromTiles,
  rebuildLocalViewportTiles,
  type TileOverlay,
} from "@/lib/map/localFog";
import { VISION_RADIUS, WORLD_SEED } from "@/lib/map/constants";

type MeResponse = {
  player: {
    id: number;
    name: string;
    x: number;
    y: number;
    gold: number;
    xp: number;
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
  config: {
    travelSecondsPerTile: number;
    worldSeed: number;
    visionRadius: number;
  };
};

type ViewportResponse = {
  center: { x: number; y: number };
  player: { x: number; y: number; id: number; name: string };
  visionRadius: number;
  tiles: ViewportTile[];
  players: Array<{ id: number; name: string; x: number; y: number }>;
};

type Selection = {
  tile: { x: number; y: number };
  entity: SelectedEntity | null;
} | null;

function clampPopup(
  left: number,
  top: number,
  width: number,
  height: number,
  containerW: number,
  containerH: number,
) {
  const maxLeft = Math.max(8, containerW - width - 8);
  const maxTop = Math.max(8, containerH - height - 8);
  return {
    left: Math.max(8, Math.min(left, maxLeft)),
    top: Math.max(8, Math.min(top, maxTop)),
  };
}

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function PlayClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [viewport, setViewport] = useState<ViewportResponse | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [anchors, setAnchors] = useState<ScreenAnchors>({
    tile: null,
    entity: null,
    cellSize: 16,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [traveling, setTraveling] = useState(false);
  const [travelProgress, setTravelProgress] = useState<TravelProgress | null>(
    null,
  );
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 });
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const refreshSeqRef = useRef(0);
  const bootstrappedRef = useRef(false);
  const travelingRef = useRef(false);
  const travelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const travelPathRef = useRef<Point[]>([]);
  const travelIndexRef = useRef(0);
  const travelOriginRef = useRef<Point | null>(null);
  const travelTargetRef = useRef<Point | null>(null);
  const displayPosRef = useRef<Point | null>(null);
  const playerIdRef = useRef<number | null>(null);
  const exploredRef = useRef<Set<string>>(new Set());
  const overlaysRef = useRef<Map<string, TileOverlay>>(new Map());
  const worldSeedRef = useRef(WORLD_SEED);
  const visionRadiusRef = useRef(VISION_RADIUS);

  const rebuildFogAt = useCallback((pos: Point) => {
    markVisionExplored(
      exploredRef.current,
      pos.x,
      pos.y,
      visionRadiusRef.current,
    );
    return rebuildLocalViewportTiles({
      center: pos,
      visionRadius: visionRadiusRef.current,
      worldSeed: worldSeedRef.current,
      explored: exploredRef.current,
      overlays: overlaysRef.current,
    });
  }, []);

  const clearTravelUi = useCallback(() => {
    travelPathRef.current = [];
    travelIndexRef.current = 0;
    travelOriginRef.current = null;
    travelTargetRef.current = null;
    travelingRef.current = false;
    setTraveling(false);
    setTravelProgress(null);
  }, []);

  const stopLocalTravelTimer = useCallback(() => {
    if (travelTimerRef.current) {
      clearInterval(travelTimerRef.current);
      travelTimerRef.current = null;
    }
  }, []);

  const applyLocalPos = useCallback(
    (pos: Point, status: string) => {
      displayPosRef.current = pos;
      const tiles = rebuildFogAt(pos);
      setMe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          player: { ...prev.player, x: pos.x, y: pos.y, status },
          travel: null,
        };
      });
      setViewport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          center: { x: pos.x, y: pos.y },
          player: { ...prev.player, x: pos.x, y: pos.y },
          visionRadius: visionRadiusRef.current,
          tiles,
        };
      });
      setSelection((prev) => {
        if (!prev?.entity || prev.entity.type !== "player") return prev;
        if (prev.entity.id !== playerIdRef.current) return prev;
        return {
          tile: { x: pos.x, y: pos.y },
          entity: { ...prev.entity, x: pos.x, y: pos.y },
        };
      });
    },
    [rebuildFogAt],
  );

  const updateTravelProgress = useCallback((index: number, pathLen: number) => {
    const origin = travelOriginRef.current;
    const target = travelTargetRef.current;
    if (!origin || !target || pathLen <= 1) {
      setTravelProgress(null);
      return;
    }
    setTravelProgress({
      origin,
      target,
      progress: Math.min(1, index / (pathLen - 1)),
    });
  }, []);

  const onAnchorsChange = useCallback((a: ScreenAnchors) => {
    setAnchors((prev) => {
      const samePoint = (
        p: { x: number; y: number } | null,
        q: { x: number; y: number } | null,
      ) => {
        if (p === null && q === null) return true;
        if (!p || !q) return false;
        return p.x === q.x && p.y === q.y;
      };
      if (
        prev.cellSize === a.cellSize &&
        samePoint(prev.tile, a.tile) &&
        samePoint(prev.entity, a.entity)
      ) {
        return prev;
      }
      return a;
    });
  }, []);

  const mapPlayer = useMemo(() => {
    if (!viewport) return null;
    return {
      id: viewport.player.id,
      name: viewport.player.name,
      x: viewport.player.x,
      y: viewport.player.y,
    };
  }, [
    viewport?.player.id,
    viewport?.player.name,
    viewport?.player.x,
    viewport?.player.y,
  ]);

  useEffect(() => {
    const mapReady = !!me && !!viewport;
    if (!mapReady) return;
    const el = mapAreaRef.current;
    if (!el) return;
    const update = () => {
      setMapSize({
        w: Math.max(1, el.clientWidth),
        h: Math.max(1, el.clientHeight),
      });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [!!me, !!viewport]);

  useEffect(() => {
    return () => {
      if (travelTimerRef.current) clearInterval(travelTimerRef.current);
    };
  }, []);

  const softRefresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    try {
      const meRes = await fetch("/api/me");
      if (seq !== refreshSeqRef.current) return;
      if (meRes.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!meRes.ok) return;
      const meData = await readJson<MeResponse>(meRes);
      if (!meData?.player) return;
      if (seq !== refreshSeqRef.current) return;

      playerIdRef.current = meData.player.id;
      worldSeedRef.current = meData.config.worldSeed ?? worldSeedRef.current;
      visionRadiusRef.current =
        meData.config.visionRadius ?? visionRadiusRef.current;

      // Bootstrap once from server; after that self pose is local-only
      if (!bootstrappedRef.current) {
        bootstrappedRef.current = true;
        displayPosRef.current = {
          x: meData.player.x,
          y: meData.player.y,
        };
      }

      const display = displayPosRef.current!;
      setError("");
      setMe((prev) => ({
        ...meData,
        player: {
          ...meData.player,
          x: display.x,
          y: display.y,
          status: travelingRef.current
            ? "traveling"
            : (prev?.player.status ?? "idle"),
        },
        travel: null,
        config: meData.config,
      }));

      const vpRes = await fetch(
        `/api/map/viewport?x=${display.x}&y=${display.y}`,
      );
      if (seq !== refreshSeqRef.current) return;
      if (!vpRes.ok) return;
      const vpData = await readJson<ViewportResponse>(vpRes);
      if (!vpData?.player) return;
      if (seq !== refreshSeqRef.current) return;

      // Others + overlays + explored only; fog/self pose from local display
      ingestExploredFromTiles(exploredRef.current, vpData.tiles);
      for (const [k, v] of overlaysFromTiles(vpData.tiles)) {
        overlaysRef.current.set(k, v);
      }
      // Re-read display in case we moved during fetch
      const live = displayPosRef.current ?? display;
      const tiles = rebuildFogAt(live);

      setViewport({
        center: { x: live.x, y: live.y },
        player: {
          id: vpData.player.id,
          name: meData.player.name,
          x: live.x,
          y: live.y,
        },
        visionRadius: visionRadiusRef.current,
        tiles,
        players: vpData.players,
      });

      if (!travelingRef.current) {
        setSelection((prev) => {
          if (!prev?.entity || prev.entity.type !== "player") return prev;
          if (prev.entity.id === meData.player.id) {
            return {
              tile: { x: live.x, y: live.y },
              entity: {
                ...prev.entity,
                x: live.x,
                y: live.y,
                name: meData.player.name,
              },
            };
          }
          const other = vpData.players.find((p) => p.id === prev.entity!.id);
          if (!other) return prev;
          return {
            tile: { x: other.x, y: other.y },
            entity: {
              ...prev.entity,
              x: other.x,
              y: other.y,
              name: other.name,
            },
          };
        });
      }
    } catch {
      // soft sync — ignore network blips
    }
  }, [rebuildFogAt]);

  useEffect(() => {
    void softRefresh();
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMapClick(payload: MapClickPayload) {
    setSelection((prev) => {
      if (payload.entity) {
        if (
          prev?.entity?.type === "player" &&
          prev.entity.id === payload.entity.id
        ) {
          return null;
        }
        return {
          tile: { x: payload.entity.x, y: payload.entity.y },
          entity: payload.entity,
        };
      }
      if (
        prev &&
        !prev.entity &&
        prev.tile.x === payload.x &&
        prev.tile.y === payload.y
      ) {
        return null;
      }
      return { tile: { x: payload.x, y: payload.y }, entity: null };
    });
  }

  function finishLocalTravel(end: Point) {
    stopLocalTravelTimer();
    clearTravelUi();
    applyLocalPos(end, "idle");
    void softRefresh();
  }

  function startLocalTravel(path: Point[], secondsPerTile: number) {
    stopLocalTravelTimer();
    if (path.length < 2) return;

    // Invalidate in-flight softRefresh so it cannot overwrite mid-travel
    refreshSeqRef.current += 1;

    const origin = path[0]!;
    const target = path[path.length - 1]!;
    travelPathRef.current = path;
    travelIndexRef.current = 0;
    travelOriginRef.current = origin;
    travelTargetRef.current = target;
    travelingRef.current = true;
    setTraveling(true);
    updateTravelProgress(0, path.length);
    applyLocalPos(origin, "traveling");

    const ms = Math.max(50, secondsPerTile * 1000);
    travelTimerRef.current = setInterval(() => {
      const next = travelIndexRef.current + 1;
      const p = travelPathRef.current;
      if (next >= p.length) {
        finishLocalTravel(p[p.length - 1]!);
        return;
      }
      travelIndexRef.current = next;
      const pos = p[next]!;
      updateTravelProgress(next, p.length);
      if (next >= p.length - 1) {
        finishLocalTravel(pos);
        return;
      }
      applyLocalPos(pos, "traveling");
    }, ms);
  }

  function onStopTravel() {
    if (!travelingRef.current) return;
    const pos = displayPosRef.current;
    if (!pos) return;
    stopLocalTravelTimer();
    clearTravelUi();
    applyLocalPos(pos, "idle");
    void (async () => {
      try {
        await fetch("/api/travel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "stop", x: pos.x, y: pos.y }),
        });
      } catch {
        // ignore — local stop already applied
      }
      void softRefresh();
    })();
  }

  async function onDirectionalMove(dx: number, dy: number, steps: number) {
    if (!me || travelingRef.current) return;
    setError("");

    const from = displayPosRef.current ?? {
      x: me.player.x,
      y: me.player.y,
    };
    const path = buildDirectionalPath(from, dx, dy, steps);
    if (path.length < 2) {
      setError("无法朝该方向移动（地图边缘）");
      return;
    }

    const origin = path[0]!;
    startLocalTravel(path, me.config.travelSecondsPerTile);

    void (async () => {
      try {
        const res = await fetch("/api/travel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "direction", dx, dy, steps }),
        });
        const data = await readJson<{ error?: string }>(res);
        if (!res.ok) {
          const progressed = travelIndexRef.current > 0;
          const here = displayPosRef.current ?? origin;
          stopLocalTravelTimer();
          clearTravelUi();
          setError(data?.error ?? "行进失败");
          if (progressed) {
            applyLocalPos(here, "idle");
            void fetch("/api/travel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: "stop", x: here.x, y: here.y }),
            }).finally(() => void softRefresh());
          } else {
            applyLocalPos(origin, "idle");
            void softRefresh();
          }
          return;
        }
      } catch {
        const progressed = travelIndexRef.current > 0;
        const here = displayPosRef.current ?? origin;
        stopLocalTravelTimer();
        clearTravelUi();
        setError("行进失败");
        if (progressed) {
          applyLocalPos(here, "idle");
          void fetch("/api/travel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "stop", x: here.x, y: here.y }),
          }).finally(() => void softRefresh());
        } else {
          applyLocalPos(origin, "idle");
          void softRefresh();
        }
      }
    })();
  }

  async function onBuild(action: "waypoint" | "claim") {
    if (!me || !selection || travelingRef.current) return;
    const { x, y } = selection.tile;
    if (me.player.x !== x || me.player.y !== y) {
      setError("须站在该格上才能操作");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          x,
          y,
          message: action === "waypoint" ? "路标" : undefined,
        }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "操作失败");
        return;
      }
      void softRefresh();
    } catch {
      setError("操作失败");
    } finally {
      setBusy(false);
    }
  }

  if (!me || !viewport) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white text-stone-600">
        加载世界中…
      </main>
    );
  }

  const TILE_W = 224;
  const TILE_H = 128;
  const ENTITY_W = 176;
  const ENTITY_H = 112;
  const GAP = 10;
  const halfCell = Math.max(8, anchors.cellSize / 2);

  const canActHere =
    !!selection &&
    !traveling &&
    me.player.x === selection.tile.x &&
    me.player.y === selection.tile.y;

  const tilePopupPos = (() => {
    if (!anchors.tile) return null;
    if (!Number.isFinite(anchors.tile.x) || !Number.isFinite(anchors.tile.y)) {
      return null;
    }
    const rawLeft = anchors.tile.x + halfCell + GAP;
    const above = anchors.tile.y - halfCell - TILE_H - GAP;
    const rawTop =
      above < 8 ? anchors.tile.y + halfCell + GAP : above;
    return clampPopup(rawLeft, rawTop, TILE_W, TILE_H, mapSize.w, mapSize.h);
  })();

  const entityPopupPos = (() => {
    if (!anchors.entity || !selection?.entity) return null;
    if (
      !Number.isFinite(anchors.entity.x) ||
      !Number.isFinite(anchors.entity.y)
    ) {
      return null;
    }
    const rawLeft = anchors.entity.x - halfCell - ENTITY_W - GAP;
    const above = anchors.entity.y - halfCell - ENTITY_H - GAP;
    const rawTop =
      above < 8 ? anchors.entity.y + halfCell + GAP : above;
    return clampPopup(rawLeft, rawTop, ENTITY_W, ENTITY_H, mapSize.w, mapSize.h);
  })();

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-white">
      <Hud
        player={me.player}
        onSignOut={() => signOut({ callbackUrl: "/" })}
      />
      {error ? (
        <p className="shrink-0 bg-red-50 px-3 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1" ref={mapAreaRef}>
        <MapCanvas
          tiles={viewport.tiles}
          center={viewport.center}
          player={mapPlayer!}
          others={viewport.players}
          visionRadius={viewport.visionRadius}
          selectedTile={selection?.tile ?? null}
          selectedEntityId={selection?.entity?.id ?? null}
          onMapClick={handleMapClick}
          onAnchorsChange={onAnchorsChange}
        />

        <div className="pointer-events-none absolute inset-0 z-10">
          {selection && tilePopupPos ? (
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${tilePopupPos.left}px, ${tilePopupPos.top}px)`,
              }}
            >
              <TilePopup
                x={selection.tile.x}
                y={selection.tile.y}
                canActHere={canActHere}
                busy={busy || traveling}
                onClose={() => setSelection(null)}
                onWaypoint={() => void onBuild("waypoint")}
                onClaim={() => void onBuild("claim")}
              />
            </div>
          ) : null}

          {selection?.entity && entityPopupPos ? (
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${entityPopupPos.left}px, ${entityPopupPos.top}px)`,
              }}
            >
              <UserCard
                name={selection.entity.name}
                isSelf={selection.entity.id === me.player.id}
                gold={me.player.gold}
                xp={me.player.xp ?? 0}
                x={selection.entity.x}
                y={selection.entity.y}
                onClose={() => setSelection(null)}
              />
            </div>
          ) : null}

          <div className="absolute bottom-4 right-4">
            <MovePad
              busy={busy}
              traveling={traveling}
              travelProgress={travelProgress}
              onMove={onDirectionalMove}
              onStop={onStopTravel}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
