"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hud } from "@/components/game/Hud";
import {
  MapCanvas,
  type ScreenAnchors,
  type SelectedEntity,
  type ViewportTile,
} from "@/components/game/MapCanvas";
import { MovePad, type TravelProgress } from "@/components/game/MovePad";
import { Minimap } from "@/components/game/Minimap";
import { UserCard, FlagCard, TownCard, BuildNameDialog, type BuildKind } from "@/components/game/UserCard";
import { MapPointPopup } from "@/components/game/MapPointPopup";
import { generateTile } from "@/lib/map/generator";
import {
  FLAG_RANGE_RADIUS,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import { ZoomSlider } from "@/components/game/ZoomSlider";
import {
  JournalPanel,
  makeLocalActivity,
  type ActivityEntry,
} from "@/components/game/JournalPanel";
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
    emoji: string;
  };
  travel: {
    pathIndex: number;
    pathLength: number;
    path: Point[];
    etaSeconds: number;
    origin: { x: number; y: number };
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
  player: { x: number; y: number; id: number; name: string; emoji?: string };
  visionRadius: number;
  tiles: ViewportTile[];
  players: Array<{
    id: number;
    name: string;
    x: number;
    y: number;
    emoji?: string;
  }>;
};

type Selection = SelectedEntity | null;

async function readJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function viewRadiusForZoom(level: number, visionR: number) {
  return Math.max(1, Math.round(visionR * 2 ** -level));
}

/** Max zoom-out view radius; softRefresh loads explored for this range. */
const MAX_VIEW_RADIUS = 80;

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
  const [pendingBuild, setPendingBuild] = useState<BuildKind | null>(null);
  const [travelProgress, setTravelProgress] = useState<TravelProgress | null>(
    null,
  );
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 });
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const refreshSeqRef = useRef(0);
  const exploredSyncSeqRef = useRef(0);
  const bootstrappedRef = useRef(false);
  const travelingRef = useRef(false);
  const travelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const travelPathRef = useRef<Point[]>([]);
  const travelIndexRef = useRef(0);
  const travelOriginRef = useRef<Point | null>(null);
  const travelTargetRef = useRef<Point | null>(null);
  const startLocalTravelRef = useRef<
    (
      path: Point[],
      secondsPerTile: number,
      startIndex?: number,
      isResume?: boolean,
    ) => void
  >(() => {});
  const displayPosRef = useRef<Point | null>(null);
  const playerIdRef = useRef<number | null>(null);
  const exploredRef = useRef<Set<string>>(new Set());
  const overlaysRef = useRef<Map<string, TileOverlay>>(new Map());
  const worldSeedRef = useRef(WORLD_SEED);
  const visionRadiusRef = useRef(VISION_RADIUS);
  const viewRadiusRef = useRef(VISION_RADIUS);
  const [mapZoomLevel, setMapZoomLevel] = useState(0);
  const mapZoomLevelRef = useRef(0);
  const [exploredRevision, setExploredRevision] = useState(0);
  const [journalTick, setJournalTick] = useState(0);
  const [localLogs, setLocalLogs] = useState<ActivityEntry[]>([]);
  const localLogSeqRef = useRef(0);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const pushLocalLog = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      localLogSeqRef.current += 1;
      const id = -localLogSeqRef.current;
      const entry = makeLocalActivity(type, payload, id);
      setLocalLogs((prev) => [entry, ...prev].slice(0, 50));
      return id;
    },
    [],
  );

  const removeLocalLog = useCallback((id: number) => {
    setLocalLogs((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const onLocalLogsMatched = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    setLocalLogs((prev) => prev.filter((e) => !drop.has(e.id)));
  }, []);

  const cancelCloseEntity = useCallback(() => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const scheduleCloseEntity = useCallback(() => {
    cancelCloseEntity();
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      setSelection(null);
    }, 180);
  }, [cancelCloseEntity]);

  const onPointSelect = useCallback(
    (point: SelectedEntity | null) => {
      if (point) {
        cancelCloseEntity();
        setSelection(point);
      } else {
        scheduleCloseEntity();
      }
    },
    [cancelCloseEntity, scheduleCloseEntity],
  );

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current) {
        clearTimeout(hoverCloseTimerRef.current);
      }
    };
  }, []);

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
      viewRadius: viewRadiusRef.current,
      worldSeed: worldSeedRef.current,
      explored: exploredRef.current,
      overlays: overlaysRef.current,
    });
  }, []);

  const syncExploredAt = useCallback(
    async (pos: Point) => {
      const seq = ++exploredSyncSeqRef.current;
      try {
        const viewR = MAX_VIEW_RADIUS;
        const [exploredRes, vpRes] = await Promise.all([
          fetch(
            `/api/map/explored?x=${pos.x}&y=${pos.y}&r=${MAX_VIEW_RADIUS}`,
          ),
          fetch(
            `/api/map/viewport?x=${pos.x}&y=${pos.y}&viewR=${viewR}`,
          ),
        ]);

        // Always merge explored (additive) even if a newer step started
        if (exploredRes.ok) {
          const data = await readJson<{ cells?: string[] }>(exploredRes);
          if (data?.cells) {
            for (const cell of data.cells) {
              exploredRef.current.add(cell);
            }
            setExploredRevision((n) => n + 1);
          }
        }

        let players = undefined as
          | Array<{ id: number; name: string; x: number; y: number }>
          | undefined;
        if (vpRes.ok) {
          const vpData = await readJson<ViewportResponse>(vpRes);
          if (vpData?.tiles) {
            ingestExploredFromTiles(exploredRef.current, vpData.tiles);
            for (const [k, v] of overlaysFromTiles(vpData.tiles)) {
              overlaysRef.current.set(k, v);
            }
            players = vpData.players;
            setExploredRevision((n) => n + 1);
          }
        }

        if (seq !== exploredSyncSeqRef.current) return;

        const live = displayPosRef.current ?? pos;
        const tiles = rebuildFogAt(live);
        setViewport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            center: { x: live.x, y: live.y },
            player: { ...prev.player, x: live.x, y: live.y },
            tiles,
            players: players ?? prev.players,
          };
        });
      } catch {
        // map sync — ignore network blips
      }
    },
    [rebuildFogAt],
  );

  const onZoomLevelChange = useCallback(
    (level: number) => {
      const clamped = Math.max(-2, Math.min(2, level));
      mapZoomLevelRef.current = clamped;
      setMapZoomLevel(clamped);
      viewRadiusRef.current = viewRadiusForZoom(
        clamped,
        visionRadiusRef.current,
      );
      const pos = displayPosRef.current;
      if (!pos) return;
      const tiles = rebuildFogAt(pos);
      setViewport((prev) => {
        if (!prev) return prev;
        return { ...prev, tiles };
      });
    },
    [rebuildFogAt],
  );

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
        if (!prev || prev.type !== "player") return prev;
        if (prev.id !== playerIdRef.current) return prev;
        return { ...prev, x: pos.x, y: pos.y };
      });
      setExploredRevision((n) => n + 1);
      void syncExploredAt(pos);
    },
    [rebuildFogAt, syncExploredAt],
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
    if (!viewport || !me) return null;
    return {
      id: me.player.id,
      name: me.player.name,
      x: viewport.player.x,
      y: viewport.player.y,
      emoji: normalizePlayerEmoji(me.player.emoji),
    };
  }, [
    me?.player.id,
    me?.player.name,
    me?.player.emoji,
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
      viewRadiusRef.current = viewRadiusForZoom(
        mapZoomLevelRef.current,
        visionRadiusRef.current,
      );

      const isFirstBootstrap = !bootstrappedRef.current;
      // Bootstrap once from server; after that self pose is local-only
      if (isFirstBootstrap) {
        bootstrappedRef.current = true;
        displayPosRef.current = {
          x: meData.player.x,
          y: meData.player.y,
        };
      }

      const display = displayPosRef.current!;
      const resumeTravel =
        isFirstBootstrap &&
        !travelingRef.current &&
        !!meData.travel?.path &&
        meData.travel.path.length - 1 > meData.travel.pathIndex;

      setError("");
      setMe((prev) => ({
        ...meData,
        player: {
          ...meData.player,
          x: display.x,
          y: display.y,
          status: travelingRef.current || resumeTravel
            ? "traveling"
            : (prev?.player.status ?? meData.player.status ?? "idle"),
        },
        // Keep travel payload only until local timer owns the trip
        travel: travelingRef.current || resumeTravel ? meData.travel : null,
        config: meData.config,
      }));

      const [vpRes, exploredRes] = await Promise.all([
        fetch(
          `/api/map/viewport?x=${display.x}&y=${display.y}&viewR=${MAX_VIEW_RADIUS}`,
        ),
        fetch(
          `/api/map/explored?x=${display.x}&y=${display.y}&r=${MAX_VIEW_RADIUS}`,
        ),
      ]);
      if (seq !== refreshSeqRef.current) return;
      if (!vpRes.ok) return;
      const vpData = await readJson<ViewportResponse>(vpRes);
      if (!vpData?.player) return;
      if (seq !== refreshSeqRef.current) return;

      const exploredData = exploredRes.ok
        ? await readJson<{ cells?: string[] }>(exploredRes)
        : null;
      if (seq !== refreshSeqRef.current) return;
      if (exploredData?.cells) {
        for (const cell of exploredData.cells) {
          exploredRef.current.add(cell);
        }
      }

      // Others + overlays + explored only; fog/self pose from local display
      ingestExploredFromTiles(exploredRef.current, vpData.tiles);
      for (const [k, v] of overlaysFromTiles(vpData.tiles)) {
        overlaysRef.current.set(k, v);
      }
      setExploredRevision((n) => n + 1);
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
          if (!prev || prev.type !== "player") return prev;
          if (prev.id === meData.player.id) {
            return {
              ...prev,
              x: live.x,
              y: live.y,
              name: meData.player.name,
            };
          }
          const other = vpData.players.find((p) => p.id === prev.id);
          if (!other) return prev;
          return {
            ...prev,
            x: other.x,
            y: other.y,
            name: other.name,
          };
        });
      }

      if (resumeTravel && meData.travel?.path) {
        const path = meData.travel.path;
        const idx = Math.max(
          0,
          Math.min(meData.travel.pathIndex, path.length - 1),
        );
        startLocalTravelRef.current(
          path,
          meData.config.travelSecondsPerTile,
          idx,
          true,
        );
      }
      setJournalTick((t) => t + 1);
    } catch {
      // soft sync — ignore network blips
    }
  }, [rebuildFogAt]);

  useEffect(() => {
    void softRefresh();
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishLocalTravel(end: Point) {
    const origin = travelOriginRef.current;
    const target = travelTargetRef.current;
    stopLocalTravelTimer();
    clearTravelUi();
    applyLocalPos(end, "idle");
    pushLocalLog("travel_arrive", {
      at: end,
      from: origin ?? undefined,
      to: target ?? undefined,
    });
    void (async () => {
      try {
        await fetch("/api/travel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "stop",
            x: end.x,
            y: end.y,
            reason: "arrived",
          }),
        });
      } catch {
        // ignore — settle on softRefresh will catch up
      }
      void softRefresh();
    })();
  }

  function startLocalTravel(
    path: Point[],
    secondsPerTile: number,
    startIndex = 0,
    isResume = false,
  ) {
    stopLocalTravelTimer();
    if (path.length < 2) return;

    const index = Math.max(0, Math.min(startIndex, path.length - 1));
    if (index >= path.length - 1) return;

    // Invalidate in-flight softRefresh so it cannot overwrite mid-travel
    // (skip on resume — we are continuing the bootstrap softRefresh)
    if (!isResume) {
      refreshSeqRef.current += 1;
    }

    const origin = path[0]!;
    const target = path[path.length - 1]!;
    travelPathRef.current = path;
    travelIndexRef.current = index;
    travelOriginRef.current = origin;
    travelTargetRef.current = target;
    travelingRef.current = true;
    setTraveling(true);
    updateTravelProgress(index, path.length);
    applyLocalPos(path[index]!, "traveling");

    const ms = Math.max(50, secondsPerTile * 1000);
    travelTimerRef.current = setInterval(() => {
      const next = travelIndexRef.current + 1;
      const p = travelPathRef.current;
      if (next >= p.length) {
        finishLocalTravel(p[p.length - 1]!);
        return;
      }
      travelIndexRef.current = next;
      // +1 gold per step (server confirms on settle/stop)
      setMe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          player: { ...prev.player, gold: prev.player.gold + 1 },
        };
      });
      const pos = p[next]!;
      updateTravelProgress(next, p.length);
      if (next >= p.length - 1) {
        finishLocalTravel(pos);
        return;
      }
      applyLocalPos(pos, "traveling");
    }, ms);
  }

  startLocalTravelRef.current = startLocalTravel;

  function onStopTravel() {
    if (!travelingRef.current) return;
    const pos = displayPosRef.current;
    if (!pos) return;
    const origin = travelOriginRef.current;
    const target = travelTargetRef.current;
    stopLocalTravelTimer();
    clearTravelUi();
    applyLocalPos(pos, "idle");
    pushLocalLog("travel_stop", {
      at: pos,
      from: origin ?? undefined,
      to: target ?? undefined,
    });
    void (async () => {
      try {
        await fetch("/api/travel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "stop",
            x: pos.x,
            y: pos.y,
            reason: "manual",
          }),
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
      setError("Can't move that way (map edge)");
      return;
    }

    const origin = path[0]!;
    const target = path[path.length - 1]!;
    const moved = path.length - 1;
    const startLogId = pushLocalLog("travel_start", {
      from: origin,
      to: target,
      steps: moved,
    });
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
          removeLocalLog(startLogId);
          setError(data?.error ?? "Travel failed");
          if (progressed) {
            applyLocalPos(here, "idle");
            pushLocalLog("travel_stop", { at: here, from: origin, to: target });
            void fetch("/api/travel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "stop",
                x: here.x,
                y: here.y,
                reason: "manual",
              }),
            }).finally(() => void softRefresh());
          } else {
            applyLocalPos(origin, "idle");
            void softRefresh();
          }
          return;
        }
        setJournalTick((t) => t + 1);
      } catch {
        const progressed = travelIndexRef.current > 0;
        const here = displayPosRef.current ?? origin;
        stopLocalTravelTimer();
        clearTravelUi();
        removeLocalLog(startLogId);
        setError("Travel failed");
        if (progressed) {
          applyLocalPos(here, "idle");
          pushLocalLog("travel_stop", { at: here, from: origin, to: target });
          void fetch("/api/travel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "stop",
              x: here.x,
              y: here.y,
              reason: "manual",
            }),
          }).finally(() => void softRefresh());
        } else {
          applyLocalPos(origin, "idle");
          void softRefresh();
        }
      }
    })();
  }

  async function onConfirmBuild(kind: BuildKind, name: string) {
    if (!me || travelingRef.current) return;
    const x = me.player.x;
    const y = me.player.y;
    setBusy(true);
    setError("");
    const buildLogId = pushLocalLog("build", {
      buildingType: kind,
      name,
      x,
      y,
    });
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, x, y, name }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        removeLocalLog(buildLogId);
        setError(data?.error ?? "Build failed");
        return;
      }
      setPendingBuild(null);
      // Optimistic map marker before softRefresh returns
      overlaysRef.current.set(`${x},${y}`, {
        building: {
          id: -1,
          type: kind,
          ownerId: me.player.id,
          ownerName: me.player.name,
          ownerEmoji: normalizePlayerEmoji(me.player.emoji),
          level: 1,
          name,
          message: name,
          createdAt: new Date().toISOString(),
          tollRadius: kind === "flag" ? FLAG_RANGE_RADIUS : null,
        },
        claim: overlaysRef.current.get(`${x},${y}`)?.claim ?? null,
      });
      const pos = displayPosRef.current ?? { x, y };
      const tiles = rebuildFogAt(pos);
      setViewport((prev) =>
        prev
          ? {
              ...prev,
              tiles,
            }
          : prev,
      );
      setExploredRevision((n) => n + 1);
      void softRefresh();
    } catch {
      removeLocalLog(buildLogId);
      setError("Build failed");
    } finally {
      setBusy(false);
    }
  }

  async function onEmojiChange(emoji: string) {
    if (!me) return;
    const prev = me.player.emoji;
    setMe((m) =>
      m
        ? { ...m, player: { ...m.player, emoji } }
        : m,
    );
    try {
      const res = await fetch("/api/player/emoji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) {
        setMe((m) =>
          m ? { ...m, player: { ...m.player, emoji: prev } } : m,
        );
        setError("Could not update avatar");
      }
    } catch {
      setMe((m) =>
        m ? { ...m, player: { ...m.player, emoji: prev } } : m,
      );
      setError("Could not update avatar");
    }
  }

  if (!me || !viewport) {
    return (
      <main className="flex h-dvh items-center justify-center bg-white text-stone-600">
        Loading world…
      </main>
    );
  }

  const ENTITY_W = 192;
  const ENTITY_H =
    selection?.type === "player" && selection.id === me.player.id ? 280 : 168;

  const selfTerrain =
    selection?.type === "player" && selection.id === me.player.id
      ? generateTile(
          me.player.x,
          me.player.y,
          me.config.worldSeed ?? WORLD_SEED,
        )
      : null;
  const selfTileKey = `${me.player.x},${me.player.y}`;
  const selfOccupied = Boolean(
    selection?.type === "player" &&
      selection.id === me.player.id &&
      overlaysRef.current.get(selfTileKey)?.building,
  );

  const popupAnchor = (() => {
    if (!selection || !anchors.entity) return null;
    if (
      !Number.isFinite(anchors.entity.x) ||
      !Number.isFinite(anchors.entity.y)
    ) {
      return null;
    }
    // Anchors are already map-area / wrap local
    return anchors.entity;
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
          viewRadius={viewRadiusForZoom(mapZoomLevel, viewport.visionRadius)}
          selectedPoint={selection}
          onPointSelect={onPointSelect}
          onAnchorsChange={onAnchorsChange}
        />

        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute left-4 top-4 z-20">
            <Minimap
              exploredRef={exploredRef}
              exploredRevision={exploredRevision}
              seed={me.config.worldSeed ?? WORLD_SEED}
              player={{ x: me.player.x, y: me.player.y }}
              viewCenter={viewport.center}
              viewRadius={viewRadiusForZoom(
                mapZoomLevel,
                viewport.visionRadius,
              )}
            />
          </div>

          <div className="absolute right-4 top-4 z-20">
            <JournalPanel
              refreshToken={journalTick}
              localLogs={localLogs}
              onLocalLogsMatched={onLocalLogsMatched}
            />
          </div>

          {selection && popupAnchor ? (
            <MapPointPopup
              anchor={popupAnchor}
              cellSize={anchors.cellSize}
              mapW={mapSize.w}
              mapH={mapSize.h}
              width={ENTITY_W}
              height={ENTITY_H}
              onMouseEnter={cancelCloseEntity}
              onMouseLeave={scheduleCloseEntity}
            >
              {selection.type === "flag" ? (
                <FlagCard flag={selection} />
              ) : selection.type === "town" ? (
                <TownCard town={selection} />
              ) : (
                <UserCard
                  name={selection.name}
                  playerId={selection.id}
                  emoji={
                    selection.id === me.player.id
                      ? me.player.emoji
                      : selection.emoji
                  }
                  isSelf={selection.id === me.player.id}
                  gold={me.player.gold}
                  xp={me.player.xp ?? 0}
                  x={selection.x}
                  y={selection.y}
                  terrain={selfTerrain?.terrain}
                  tileOccupied={selfOccupied}
                  busy={busy || traveling}
                  onBuildSelect={
                    selection.id === me.player.id
                      ? (kind) => setPendingBuild(kind)
                      : undefined
                  }
                  onEmojiChange={
                    selection.id === me.player.id
                      ? (emoji) => void onEmojiChange(emoji)
                      : undefined
                  }
                />
              )}
            </MapPointPopup>
          ) : null}

          <div className="absolute bottom-4 left-4 z-20">
            <ZoomSlider
              zoomLevel={mapZoomLevel}
              visionRadius={viewport.visionRadius}
              onZoomLevelChange={onZoomLevelChange}
            />
          </div>

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

      {pendingBuild ? (
        <BuildNameDialog
          kind={pendingBuild}
          busy={busy}
          onCancel={() => setPendingBuild(null)}
          onConfirm={(name) => void onConfirmBuild(pendingBuild, name)}
        />
      ) : null}
    </main>
  );
}
