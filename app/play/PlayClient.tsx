"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapCanvas,
  type ScreenAnchors,
  type SelectedEntity,
  type ViewportTile,
} from "@/components/game/MapCanvas";
import { MovePad, type TravelProgress } from "@/components/game/MovePad";
import { Minimap } from "@/components/game/Minimap";
import { OnlinePlayers, type OnlinePlayer } from "@/components/game/OnlinePlayers";
import { PlayerStatusPanel } from "@/components/game/PlayerStatusPanel";
import { HelpModal } from "@/components/game/HelpModal";
import {
  PlayerProfileModal,
  type PlayerProfileTarget,
} from "@/components/game/PlayerProfileModal";
import {
  AllAssetsModal,
  AllPlayersModal,
} from "@/components/game/DirectoryModals";
import {
  UserCard,
  SelfToolCard,
  FlagCard,
  TownCard,
  BuildNameDialog,
  type BuildKind,
} from "@/components/game/UserCard";
import { MapPointPopup } from "@/components/game/MapPointPopup";
import { OpenSourceFooter } from "@/components/OpenSourceFooter";
import { generateTile } from "@/lib/map/generator";
import {
  FLAG_RANGE_RADIUS,
  normalizeBubble,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";
import { buildNeedsName, applyBuildWallet } from "@/lib/game/buildCatalog";
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
import { TollNoticeModal } from "@/components/game/TollNoticeModal";
import { WorkOfferModal, type WorkOffer } from "@/components/game/WorkOfferModal";
import { VISION_RADIUS, WORLD_SEED, XP_BUILD, XP_PER_STEP } from "@/lib/map/constants";
import { isSpacedStructureType } from "@/lib/game/structureSpacing";
import {
  isWorkplaceBuildingType,
  type WorkJobView,
} from "@/lib/game/workplaceMeta";
import {
  defaultTollAmount,
  defaultTollRadius,
  findTollEntries,
  isInStructureRange,
  type TollStructure,
} from "@/lib/game/structureToll";
import { type TollNotice } from "@/lib/game/tollNotice";
import { xpForToll } from "@/lib/game/xp";
import {
  isMapRealtimeMessage,
  mapChannelName,
  type BuildMessage,
  type PresenceMember,
  type TollMessage,
} from "@/lib/ably/channels";
import { closeAblyClient, getAblyClient } from "@/lib/ably/client";
import {
  markMapOtherOffline,
  mergeViewportPlayers,
  patchMapOtherBubble,
  presenceToOnline,
  removeOnlinePlayer,
  upsertMapOther,
  upsertOnlinePlayer,
} from "@/lib/ably/merge";
import type { RealtimeChannel } from "ably";

type MeResponse = {
  player: {
    id: number;
    name: string;
    x: number;
    y: number;
    gold: number;
    xp: number;
    exploredCells?: number;
    stone: number;
    wood: number;
    food: number;
    population: number;
    ore: number;
    status: string;
    emoji: string;
    bubble?: string;
    currentMapId?: number;
  };
  travel: {
    pathIndex: number;
    pathLength: number;
    path: Point[];
    etaSeconds: number;
    origin: { x: number; y: number };
    target: { x: number; y: number };
  } | null;
  work?: WorkJobView | null;
  friends: Array<{ id: number; name: string; x: number; y: number }>;
  map?: { id: number; slug: string; name: string; seed: number; size: number };
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
    bubble?: string;
    online?: boolean;
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
  const confirmBuildRef = useRef<(kind: BuildKind, name: string) => void>(
    () => {},
  );
  const [profileTarget, setProfileTarget] =
    useState<PlayerProfileTarget | null>(null);
  const [directory, setDirectory] = useState<"players" | "assets" | null>(
    null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [workOffer, setWorkOffer] = useState<WorkOffer | null>(null);
  const [workBusy, setWorkBusy] = useState(false);
  const [tollNotices, setTollNotices] = useState<TollNotice[]>([]);
  const tollNoticeSeqRef = useRef(0);
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
  const goldRef = useRef(0);
  const workRef = useRef<WorkJobView | null>(null);
  const dismissedWorkRef = useRef<Set<number>>(new Set());
  const workOfferRef = useRef<WorkOffer | null>(null);
  const onStopWorkRef = useRef<() => void>(() => {});
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
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const localLogSeqRef = useRef(0);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const ablyReadyRef = useRef(false);
  const ablyPresentIdsRef = useRef<Set<number>>(new Set());
  const ablyChannelRef = useRef<RealtimeChannel | null>(null);
  const meMetaRef = useRef<{
    id: number;
    name: string;
    emoji: string;
    bubble: string;
    mapId: number;
  } | null>(null);
  const softRefreshRef = useRef<() => void>(() => {});
  const publishRealtimeRef = useRef<{
    publishPos: (pos: Point, status: string) => void;
    publishBubble: (bubble: string) => void;
    publishBuild: (msg: Omit<BuildMessage, "type">) => void;
    publishToll: (msg: Omit<TollMessage, "type">) => void;
  } | null>(null);

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

  useEffect(() => {
    if (!me?.player) return;
    meMetaRef.current = {
      id: me.player.id,
      name: me.player.name,
      emoji: normalizePlayerEmoji(me.player.emoji),
      bubble: normalizeBubble(me.player.bubble),
      mapId: me.player.currentMapId ?? me.map?.id ?? 1,
    };
  }, [
    me?.player.id,
    me?.player.name,
    me?.player.emoji,
    me?.player.bubble,
    me?.player.currentMapId,
    me?.map?.id,
  ]);

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

  const trySelectBuild = useCallback(
    (kind: BuildKind) => {
      if (!me || travelingRef.current) return;
      setError("");
      if (buildNeedsName(kind)) {
        setPendingBuild(kind);
      } else {
        confirmBuildRef.current(kind, "");
      }
    },
    [me],
  );

  /** Known flag/town/waypoint overlays for local toll preview. */
  const collectLocalTollStructures = useCallback((): TollStructure[] => {
    const out: TollStructure[] = [];
    for (const [key, overlay] of overlaysRef.current) {
      const b = overlay.building;
      if (!b || !isSpacedStructureType(b.type) || b.id <= 0) continue;
      const comma = key.indexOf(",");
      if (comma < 0) continue;
      const sx = Number(key.slice(0, comma));
      const sy = Number(key.slice(comma + 1));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      out.push({
        id: b.id,
        x: sx,
        y: sy,
        radius: defaultTollRadius(b.tollRadius),
        ownerId: b.ownerId,
        type: b.type,
        name: b.name ?? null,
        amount: defaultTollAmount(b.tollAmount, b.type),
        ownerName: b.ownerName,
      });
    }
    return out;
  }, []);

  const collectLocalWorkplaces = useCallback((): TollStructure[] => {
    const out: TollStructure[] = [];
    for (const [key, overlay] of overlaysRef.current) {
      const b = overlay.building;
      if (!b || !isWorkplaceBuildingType(b.type) || b.id <= 0) continue;
      const comma = key.indexOf(",");
      if (comma < 0) continue;
      const sx = Number(key.slice(0, comma));
      const sy = Number(key.slice(comma + 1));
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      out.push({
        id: b.id,
        x: sx,
        y: sy,
        radius: defaultTollRadius(b.tollRadius),
        ownerId: b.ownerId,
        type: b.type,
        name: b.name ?? null,
        amount: 0,
        ownerName: b.ownerName,
      });
    }
    return out;
  }, []);

  /** Instant gold + settle journal when stepping into influence. */
  const applyLocalTollEntries = useCallback(
    (previous: Point, next: Point) => {
      const travelerId = playerIdRef.current;
      if (!travelerId) return;
      const entries = findTollEntries(
        previous,
        [next],
        collectLocalTollStructures(),
        travelerId,
      );
      if (entries.length === 0) return;

      // Optimistic gold + XP only — log comes from server after settle.
      let gold = goldRef.current;
      let tollXp = 0;
      const paid: Array<{ structure: TollStructure; at: Point }> = [];
      for (const { structure: b, at } of entries) {
        if (b.amount <= 0 || gold < b.amount) break;
        gold -= b.amount;
        tollXp += xpForToll(b.amount);
        paid.push({ structure: b, at });
      }
      if (paid.length === 0) return;

      const payerNotices: TollNotice[] = paid.map(({ structure: b }) => {
        tollNoticeSeqRef.current += 1;
        return {
          id: tollNoticeSeqRef.current,
          role: "payer",
          buildingType: b.type,
          buildingName: b.name,
          otherPlayerName: b.ownerName?.trim() || "another traveler",
          amount: b.amount,
        };
      });
      setTollNotices((prev) => [...prev, ...payerNotices]);
      for (const { structure: b, at } of paid) {
        pushLocalLog("toll_paid", {
          amount: b.amount,
          buildingType: b.type,
          buildingName: b.name,
          buildingId: b.id,
          ownerId: b.ownerId,
          ownerName: b.ownerName ?? "someone",
          at,
        });
      }

      goldRef.current = gold;
      setMe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          player: {
            ...prev.player,
            gold,
            xp: prev.player.xp + tollXp,
          },
        };
      });

      // Settle path on server now so toll_paid / toll_received land immediately.
      void (async () => {
        try {
          const res = await fetch("/api/me");
          if (!res.ok) return;
          const data = await readJson<MeResponse>(res);
          if (data?.player && typeof data.player.gold === "number") {
            goldRef.current = data.player.gold;
            setMe((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                player: {
                  ...prev.player,
                  gold: data.player.gold,
                  xp:
                    typeof data.player.xp === "number"
                      ? data.player.xp
                      : prev.player.xp,
                  exploredCells:
                    typeof data.player.exploredCells === "number"
                      ? data.player.exploredCells
                      : prev.player.exploredCells,
                },
              };
            });
          }
          const fromName = meMetaRef.current?.name ?? "A traveler";
          const fromId = playerIdRef.current ?? 0;
          for (const { structure: b } of paid) {
            publishRealtimeRef.current?.publishToll({
              toPlayerId: b.ownerId,
              amount: b.amount,
              fromPlayerId: fromId,
              fromPlayerName: fromName,
              buildingType: b.type,
              buildingName: b.name,
              buildingId: b.id,
            });
          }
          setJournalTick((t) => t + 1);
        } catch {
          // soft — stop/arrive settle will catch up
        }
      })();
    },
    [collectLocalTollStructures, pushLocalLog],
  );

  const applyLocalWorkplaceEntries = useCallback(
    (previous: Point, next: Point) => {
      const travelerId = playerIdRef.current;
      if (!travelerId) return;
      const entries = findTollEntries(
        previous,
        [next],
        collectLocalWorkplaces(),
        travelerId,
      );
      if (entries.length === 0) return;

      const currentWork = workRef.current;
      for (const { structure: b } of entries) {
        if (dismissedWorkRef.current.has(b.id)) continue;
        if (currentWork?.buildingId === b.id) continue;
        if (workOfferRef.current?.buildingId === b.id) continue;
        const offer: WorkOffer = {
          buildingId: b.id,
          buildingType: b.type,
          buildingName: b.name,
          ownerName: b.ownerName?.trim() || "another traveler",
          x: b.x,
          y: b.y,
          radius: b.radius,
        };
        pushLocalLog("work_offer", {
          buildingId: offer.buildingId,
          buildingType: offer.buildingType,
          buildingName: offer.buildingName,
          ownerName: offer.ownerName,
          x: offer.x,
          y: offer.y,
          radius: offer.radius,
          status: "pending",
        });
        if (!workOfferRef.current) {
          workOfferRef.current = offer;
          setWorkOffer(offer);
        }
      }
    },
    [collectLocalWorkplaces, pushLocalLog],
  );

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

        let httpPlayers:
          | ViewportResponse["players"]
          | undefined;
        if (vpRes.ok) {
          const vpData = await readJson<ViewportResponse>(vpRes);
          if (vpData?.tiles) {
            ingestExploredFromTiles(exploredRef.current, vpData.tiles);
            for (const [k, v] of overlaysFromTiles(vpData.tiles)) {
              overlaysRef.current.set(k, v);
            }
            httpPlayers = vpData.players;
            setExploredRevision((n) => n + 1);
          }
        }

        if (seq !== exploredSyncSeqRef.current) return;

        const live = displayPosRef.current ?? pos;
        const tiles = rebuildFogAt(live);
        setViewport((prev) => {
          if (!prev) return prev;
          const nextPlayers =
            httpPlayers == null
              ? prev.players
              : ablyReadyRef.current
                ? mergeViewportPlayers({
                    ablyIds: ablyPresentIdsRef.current,
                    ablyPlayers: prev.players,
                    httpPlayers,
                    selfId: playerIdRef.current ?? -1,
                    selfPos: live,
                    visionRadius: visionRadiusRef.current,
                  })
                : httpPlayers;
          return {
            ...prev,
            center: { x: live.x, y: live.y },
            player: { ...prev.player, x: live.x, y: live.y },
            tiles,
            players: nextPlayers,
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
      publishRealtimeRef.current?.publishPos(pos, status);
      const job = workRef.current;
      if (
        job &&
        !isInStructureRange(pos.x, pos.y, job.x, job.y, job.radius)
      ) {
        onStopWorkRef.current();
      }
      for (const wp of collectLocalWorkplaces()) {
        if (!isInStructureRange(pos.x, pos.y, wp.x, wp.y, wp.radius)) {
          dismissedWorkRef.current.delete(wp.id);
        }
      }
    },
    [rebuildFogAt, syncExploredAt, collectLocalWorkplaces],
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
      bubble: normalizeBubble(me.player.bubble),
      online: true,
    };
  }, [
    me?.player.id,
    me?.player.name,
    me?.player.emoji,
    me?.player.bubble,
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
        window.location.href = "/";
        return;
      }
      if (!meRes.ok) return;
      const meData = await readJson<MeResponse>(meRes);
      if (!meData?.player) return;
      if (seq !== refreshSeqRef.current) return;

      playerIdRef.current = meData.player.id;
      goldRef.current = meData.player.gold;
      workRef.current = meData.work ?? null;
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
          population:
            meData.player.population ?? meData.player.ore ?? 0,
          x: display.x,
          y: display.y,
          status: travelingRef.current || resumeTravel
            ? "traveling"
            : (prev?.player.status ?? meData.player.status ?? "idle"),
        },
        // Keep travel payload only until local timer owns the trip
        travel: travelingRef.current || resumeTravel ? meData.travel : null,
        work: meData.work ?? null,
        config: meData.config,
        map: meData.map ?? prev?.map,
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

      setViewport((prev) => ({
        center: { x: live.x, y: live.y },
        player: {
          id: vpData.player.id,
          name: meData.player.name,
          x: live.x,
          y: live.y,
        },
        visionRadius: visionRadiusRef.current,
        tiles,
        players: ablyReadyRef.current
          ? mergeViewportPlayers({
              ablyIds: ablyPresentIdsRef.current,
              ablyPlayers: prev?.players ?? [],
              httpPlayers: vpData.players,
              selfId: meData.player.id,
              selfPos: live,
              visionRadius: visionRadiusRef.current,
            })
          : vpData.players,
      }));

      if (!travelingRef.current) {
        setSelection((sel) => {
          if (!sel || sel.type !== "player") return sel;
          if (sel.id === meData.player.id) {
            return {
              ...sel,
              x: live.x,
              y: live.y,
              name: meData.player.name,
            };
          }
          if (ablyPresentIdsRef.current.has(sel.id)) {
            return { ...sel, online: true };
          }
          const other = vpData.players.find((p) => p.id === sel.id);
          if (!other) return sel;
          return {
            ...sel,
            x: other.x,
            y: other.y,
            name: other.name,
            online: other.online ?? false,
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

  softRefreshRef.current = () => {
    void softRefresh();
  };

  useEffect(() => {
    if (!me?.work?.buildingId) return;
    const t = window.setInterval(() => {
      void softRefreshRef.current();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [me?.work?.buildingId]);

  useEffect(() => {
    void softRefresh();
    // mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ably realtime: presence + map channel (degrades silently if unavailable)
  useEffect(() => {
    if (!me?.player?.id) return;
    const mapId = me.player.currentMapId ?? me.map?.id;
    if (!mapId) return;

    let cancelled = false;
    const selfId = me.player.id;
    const channelName = mapChannelName(mapId);

    const applyPresenceMember = (raw: unknown, action: string) => {
      if (!raw || typeof raw !== "object") return;
      const data = raw as Partial<PresenceMember>;
      if (typeof data.id !== "number" || data.id === selfId) return;
      const member: PresenceMember = {
        id: data.id,
        name: typeof data.name === "string" ? data.name : `#${data.id}`,
        emoji: normalizePlayerEmoji(data.emoji),
        bubble: normalizeBubble(data.bubble),
        x: typeof data.x === "number" ? data.x : 0,
        y: typeof data.y === "number" ? data.y : 0,
        status: typeof data.status === "string" ? data.status : "idle",
      };
      if (action === "leave" || action === "absent") {
        ablyPresentIdsRef.current.delete(member.id);
        setOnlinePlayers((prev) => removeOnlinePlayer(prev, member.id));
        setViewport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: markMapOtherOffline(prev.players, member.id),
          };
        });
        return;
      }
      ablyPresentIdsRef.current.add(member.id);
      setOnlinePlayers((prev) =>
        upsertOnlinePlayer(prev, presenceToOnline(member)),
      );
      const selfPos = displayPosRef.current ?? {
        x: member.x,
        y: member.y,
      };
      setViewport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: upsertMapOther(
            prev.players,
            { ...member, online: true },
            selfId,
            selfPos,
            visionRadiusRef.current,
          ),
        };
      });
    };

    const onMessage = (message: { data?: unknown }) => {
      if (!isMapRealtimeMessage(message.data)) return;
      const msg = message.data;
      if (msg.type === "pos") {
        if (msg.playerId === selfId) return;
        setOnlinePlayers((prev) =>
          upsertOnlinePlayer(prev, {
            id: msg.playerId,
            name: msg.name,
            emoji: normalizePlayerEmoji(msg.emoji),
            x: msg.x,
            y: msg.y,
            status: msg.status,
          }),
        );
        ablyPresentIdsRef.current.add(msg.playerId);
        const selfPos = displayPosRef.current ?? { x: msg.x, y: msg.y };
        setViewport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: upsertMapOther(
              prev.players,
              {
                id: msg.playerId,
                name: msg.name,
                x: msg.x,
                y: msg.y,
                emoji: msg.emoji,
                bubble: msg.bubble,
                online: true,
              },
              selfId,
              selfPos,
              visionRadiusRef.current,
            ),
          };
        });
        return;
      }
      if (msg.type === "bubble") {
        if (msg.playerId === selfId) return;
        setViewport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: patchMapOtherBubble(
              prev.players,
              msg.playerId,
              msg.bubble,
            ),
          };
        });
        return;
      }
      if (msg.type === "build") {
        overlaysRef.current.set(`${msg.x},${msg.y}`, {
          building: {
            id: msg.buildingId ?? -1,
            type: msg.buildingType,
            ownerId: msg.ownerId,
            ownerName: msg.ownerName,
            ownerEmoji: normalizePlayerEmoji(msg.ownerEmoji),
            level: 1,
            name: msg.name,
            message: msg.name,
            createdAt: new Date().toISOString(),
            tollRadius: msg.tollRadius,
          },
          claim: overlaysRef.current.get(`${msg.x},${msg.y}`)?.claim ?? null,
        });
        const pos = displayPosRef.current;
        if (pos) {
          const tiles = rebuildFogAt(pos);
          setViewport((prev) => (prev ? { ...prev, tiles } : prev));
          setExploredRevision((n) => n + 1);
        }
        return;
      }
      if (msg.type === "toll") {
        if (msg.toPlayerId !== selfId) return;
        tollNoticeSeqRef.current += 1;
        setTollNotices((prev) => [
          ...prev,
          {
            id: tollNoticeSeqRef.current,
            role: "owner",
            buildingType: msg.buildingType ?? "flag",
            buildingName: msg.buildingName ?? null,
            otherPlayerName: msg.fromPlayerName?.trim() || "A traveler",
            amount: msg.amount,
          },
        ]);
        pushLocalLog("toll_received", {
          amount: msg.amount,
          buildingType: msg.buildingType ?? "flag",
          buildingName: msg.buildingName ?? null,
          buildingId: msg.buildingId,
          fromPlayerId: msg.fromPlayerId,
          fromPlayerName: msg.fromPlayerName ?? "a traveler",
        });
        setJournalTick((t) => t + 1);
        softRefreshRef.current();
      }
    };

    void (async () => {
      const client = getAblyClient();
      if (!client || cancelled) return;

      const channel = client.channels.get(channelName);
      ablyChannelRef.current = channel;

      publishRealtimeRef.current = {
        publishPos: (pos, status) => {
          const meta = meMetaRef.current;
          if (!meta || !ablyReadyRef.current) return;
          const payload: PresenceMember = {
            id: meta.id,
            name: meta.name,
            emoji: meta.emoji,
            bubble: meta.bubble,
            x: pos.x,
            y: pos.y,
            status,
          };
          try {
            void channel.presence.update(payload);
            void channel.publish("pos", {
              type: "pos",
              playerId: meta.id,
              name: meta.name,
              emoji: meta.emoji,
              bubble: meta.bubble,
              x: pos.x,
              y: pos.y,
              status,
            });
          } catch {
            // ignore publish errors
          }
        },
        publishBubble: (bubble) => {
          const meta = meMetaRef.current;
          if (!meta || !ablyReadyRef.current) return;
          const text = normalizeBubble(bubble);
          const pos = displayPosRef.current ?? { x: 0, y: 0 };
          const payload: PresenceMember = {
            id: meta.id,
            name: meta.name,
            emoji: meta.emoji,
            bubble: text,
            x: pos.x,
            y: pos.y,
            status: travelingRef.current ? "traveling" : "idle",
          };
          try {
            void channel.presence.update(payload);
            void channel.publish("bubble", {
              type: "bubble",
              playerId: meta.id,
              bubble: text,
            });
          } catch {
            // ignore
          }
        },
        publishBuild: (body) => {
          if (!ablyReadyRef.current) return;
          try {
            void channel.publish("build", { type: "build", ...body });
          } catch {
            // ignore
          }
        },
        publishToll: (body) => {
          if (!ablyReadyRef.current) return;
          try {
            void channel.publish("toll", { type: "toll", ...body });
          } catch {
            // ignore
          }
        },
      };

      try {
        channel.subscribe(onMessage);
        channel.presence.subscribe((msg) => {
          applyPresenceMember(msg.data, msg.action);
        });

        const enterData: PresenceMember = {
          id: me.player.id,
          name: me.player.name,
          emoji: normalizePlayerEmoji(me.player.emoji),
          bubble: normalizeBubble(me.player.bubble),
          x: displayPosRef.current?.x ?? me.player.x,
          y: displayPosRef.current?.y ?? me.player.y,
          status: travelingRef.current ? "traveling" : me.player.status,
        };
        await channel.presence.enter(enterData);
        if (cancelled) return;

        const members = await channel.presence.get();
        if (cancelled) return;
        ablyPresentIdsRef.current = new Set();
        const online: OnlinePlayer[] = [
          {
            id: me.player.id,
            name: me.player.name,
            emoji: normalizePlayerEmoji(me.player.emoji),
            x: enterData.x,
            y: enterData.y,
            status: enterData.status,
            isSelf: true,
          },
        ];
        for (const m of members) {
          const data = m.data as Partial<PresenceMember> | undefined;
          if (!data || typeof data.id !== "number" || data.id === selfId) {
            continue;
          }
          online.push(
            presenceToOnline({
              id: data.id,
              name: typeof data.name === "string" ? data.name : `#${data.id}`,
              emoji: normalizePlayerEmoji(data.emoji),
              x: typeof data.x === "number" ? data.x : 0,
              y: typeof data.y === "number" ? data.y : 0,
              status: typeof data.status === "string" ? data.status : "idle",
            }),
          );
          applyPresenceMember(data, "present");
        }
        setOnlinePlayers(online);
        ablyReadyRef.current = true;
      } catch (err) {
        console.warn("[ably] connect failed; staying on HTTP sync", err);
        ablyReadyRef.current = false;
        ablyPresentIdsRef.current = new Set();
        publishRealtimeRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      ablyReadyRef.current = false;
      ablyPresentIdsRef.current = new Set();
      publishRealtimeRef.current = null;
      const ch = ablyChannelRef.current;
      ablyChannelRef.current = null;
      if (ch) {
        try {
          void ch.presence.leave();
          ch.unsubscribe();
          ch.presence.unsubscribe();
        } catch {
          // ignore
        }
      }
      closeAblyClient();
    };
    // Connect once per player/map; pose updates go through presence.update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.player.id, me?.player.currentMapId, me?.map?.id, rebuildFogAt]);

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
      // +1 gold and XP per step (server confirms on settle/stop)
      goldRef.current += 1;
      setMe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          player: {
            ...prev.player,
            gold: prev.player.gold + 1,
            xp: prev.player.xp + XP_PER_STEP,
          },
        };
      });
      const pos = p[next]!;
      const prevPos = p[next - 1];
      if (prevPos) {
        applyLocalTollEntries(prevPos, pos);
        applyLocalWorkplaceEntries(prevPos, pos);
      }
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

  function onCancelWorkOffer() {
    const offer = workOfferRef.current;
    if (offer) dismissedWorkRef.current.add(offer.buildingId);
    workOfferRef.current = null;
    setWorkOffer(null);
  }

  async function startWorkAt(offer: WorkOffer) {
    if (workBusy) return;
    setWorkBusy(true);
    if (travelingRef.current) {
      onStopTravel();
    }
    try {
      const res = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "start", buildingId: offer.buildingId }),
      });
      const data = await readJson<{ error?: string; work?: WorkJobView }>(res);
      if (!res.ok || !data?.work) {
        setError(data?.error ?? "Could not start work");
        return;
      }
      workRef.current = data.work;
      if (workOfferRef.current?.buildingId === offer.buildingId) {
        workOfferRef.current = null;
        setWorkOffer(null);
      }
      setMe((prev) => (prev ? { ...prev, work: data.work! } : prev));
      setLocalLogs((prev) =>
        prev.map((e) =>
          e.type === "work_offer" && e.payload.buildingId === offer.buildingId
            ? { ...e, payload: { ...e.payload, status: "accepted" } }
            : e,
        ),
      );
    } catch {
      setError("Could not start work");
    } finally {
      setWorkBusy(false);
    }
  }

  function onAcceptWork() {
    const offer = workOfferRef.current;
    if (!offer) return;
    void startWorkAt(offer);
  }

  function onAcceptWorkFromLog(buildingId: number) {
    const wp = collectLocalWorkplaces().find((w) => w.id === buildingId);
    if (wp) {
      void startWorkAt({
        buildingId: wp.id,
        buildingType: wp.type,
        buildingName: wp.name,
        ownerName: wp.ownerName?.trim() || "another traveler",
        x: wp.x,
        y: wp.y,
        radius: wp.radius,
      });
      return;
    }
    const fromLog = localLogs.find(
      (e) => e.type === "work_offer" && e.payload.buildingId === buildingId,
    );
    if (!fromLog) {
      setError("That workplace is no longer in view");
      return;
    }
    const p = fromLog.payload;
    void startWorkAt({
      buildingId,
      buildingType: String(p.buildingType ?? "farm"),
      buildingName:
        typeof p.buildingName === "string" ? p.buildingName : null,
      ownerName:
        typeof p.ownerName === "string" ? p.ownerName : "another traveler",
      x: typeof p.x === "number" ? p.x : 0,
      y: typeof p.y === "number" ? p.y : 0,
      radius: typeof p.radius === "number" ? p.radius : 5,
    });
  }

  function onStopWork() {
    if (!workRef.current) return;
    workRef.current = null;
    setMe((prev) => (prev ? { ...prev, work: null } : prev));
    void (async () => {
      try {
        await fetch("/api/work", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "stop" }),
        });
      } catch {
        // ignore
      }
      void softRefresh();
    })();
  }
  onStopWorkRef.current = onStopWork;

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
    const buildName = name.trim() || null;
    const buildLogId = pushLocalLog("build", {
      buildingType: kind,
      name: buildName,
      x,
      y,
    });
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind,
          x,
          y,
          ...(buildName ? { name: buildName } : {}),
        }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        removeLocalLog(buildLogId);
        setError(data?.error ?? "Build failed");
        return;
      }
      setPendingBuild(null);
      // Optimistic map marker + XP before softRefresh returns
      setMe((prev) => {
        if (!prev) return prev;
        const next = applyBuildWallet(
          {
            gold: prev.player.gold,
            stone: prev.player.stone,
            wood: prev.player.wood,
            food: prev.player.food,
            population: prev.player.population ?? prev.player.ore ?? 0,
          },
          kind,
        );
        return {
          ...prev,
          player: {
            ...prev.player,
            xp: prev.player.xp + XP_BUILD,
            gold: next.gold,
            stone: next.stone,
            wood: next.wood,
            food: next.food,
            population: next.population,
            ore: next.population,
          },
        };
      });
      overlaysRef.current.set(`${x},${y}`, {
        building: {
          id: -1,
          type: kind,
          ownerId: me.player.id,
          ownerName: me.player.name,
          ownerEmoji: normalizePlayerEmoji(me.player.emoji),
          level: 1,
          name: buildName,
          message: buildName,
          createdAt: new Date().toISOString(),
          tollRadius:
            kind === "flag" ||
            kind === "town" ||
            kind === "mine" ||
            kind === "farm" ||
            kind === "lumber"
              ? FLAG_RANGE_RADIUS
              : null,
          tollAmount:
            kind === "flag" || kind === "town"
              ? defaultTollAmount(null, kind)
              : null,
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
      setJournalTick((t) => t + 1);
      publishRealtimeRef.current?.publishBuild({
        buildingType: kind,
        x,
        y,
        ownerId: me.player.id,
        ownerName: me.player.name,
        ownerEmoji: normalizePlayerEmoji(me.player.emoji),
        name: buildName,
        tollRadius:
          kind === "flag" ||
          kind === "town" ||
          kind === "mine" ||
          kind === "farm" ||
          kind === "lumber"
            ? FLAG_RANGE_RADIUS
            : null,
      });
      void softRefresh();
    } catch {
      removeLocalLog(buildLogId);
      setError("Build failed");
    } finally {
      setBusy(false);
    }
  }
  confirmBuildRef.current = (kind, name) => {
    void onConfirmBuild(kind, name);
  };

  async function onRenameBuilding(buildingId: number, name: string) {
    const trimmed = name.trim();
    if (!me || buildingId <= 0 || trimmed.length < 1) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/buildings/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await readJson<{ error?: string; name?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Could not rename");
        return;
      }
      const nextName = data?.name ?? trimmed;
      for (const [key, overlay] of overlaysRef.current) {
        if (overlay.building?.id === buildingId) {
          overlaysRef.current.set(key, {
            ...overlay,
            building: {
              ...overlay.building,
              name: nextName,
              message: nextName,
            },
          });
        }
      }
      setSelection((prev) => {
        if (!prev || (prev.type !== "flag" && prev.type !== "town")) {
          return prev;
        }
        if (prev.id !== buildingId) return prev;
        return { ...prev, name: nextName };
      });
      const pos = displayPosRef.current ?? {
        x: me.player.x,
        y: me.player.y,
      };
      setViewport((prev) =>
        prev ? { ...prev, tiles: rebuildFogAt(pos) } : prev,
      );
      setJournalTick((t) => t + 1);
    } catch {
      setError("Could not rename");
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

  async function onBubbleChange(bubble: string) {
    if (!me) return;
    const next = normalizeBubble(bubble);
    const prev = normalizeBubble(me.player.bubble);
    setMe((m) =>
      m ? { ...m, player: { ...m.player, bubble: next } } : m,
    );
    try {
      const res = await fetch("/api/player/bubble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bubble: next }),
      });
      if (!res.ok) {
        setMe((m) =>
          m ? { ...m, player: { ...m.player, bubble: prev } } : m,
        );
        setError("Could not update bubble");
        return;
      }
      const data = await readJson<{ bubble?: string }>(res);
      const saved = normalizeBubble(data?.bubble ?? next);
      setMe((m) =>
        m ? { ...m, player: { ...m.player, bubble: saved } } : m,
      );
      publishRealtimeRef.current?.publishBubble(saved);
    } catch {
      setMe((m) =>
        m ? { ...m, player: { ...m.player, bubble: prev } } : m,
      );
      setError("Could not update bubble");
    }
  }

  if (!me || !viewport) {
    return (
      <main className="relative flex h-dvh items-center justify-center overflow-hidden text-stone-100">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Image
            src="/home-ocean-horizon.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-stone-950/50" />
        </div>
        <p className="relative z-10">Loading world…</p>
      </main>
    );
  }

  const ENTITY_W =
    selection?.type === "player" && selection.id === me.player.id ? 224 : 192;
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
  const selfOverlay = overlaysRef.current.get(selfTileKey);
  const selfOccupied = Boolean(
    selection?.type === "player" &&
      selection.id === me.player.id &&
      selfOverlay?.building,
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
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <Image
          src="/home-ocean-horizon.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-stone-950/35" />
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      {error ? (
        <p className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-lg bg-red-50/95 px-3 py-1 text-xs text-red-700 shadow">
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
          onPlayerClick={(p) =>
            setProfileTarget({
              id: p.id,
              name: p.name,
              emoji: p.emoji,
              x: p.x,
              y: p.y,
              online: p.online,
            })
          }
          onAnchorsChange={onAnchorsChange}
        />

        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute left-4 top-4 z-20 flex flex-col items-stretch gap-2">
            <div className="pointer-events-auto flex gap-1.5">
              <button
                type="button"
                onClick={() => setDirectory("players")}
                className="rounded-lg border border-stone-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-md backdrop-blur hover:bg-stone-50"
              >
                Players
              </button>
              <button
                type="button"
                onClick={() => setDirectory("assets")}
                className="rounded-lg border border-stone-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-md backdrop-blur hover:bg-stone-50"
              >
                Assets
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="rounded-lg border border-stone-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-md backdrop-blur hover:bg-stone-50"
              >
                Help
              </button>
            </div>
            <PlayerStatusPanel
              player={{
                name: me.player.name,
                emoji: me.player.emoji,
                bubble: me.player.bubble,
                gold: me.player.gold,
                xp: me.player.xp,
                exploredCells: me.player.exploredCells,
                stone: me.player.stone,
                wood: me.player.wood,
                food: me.player.food,
                population: me.player.population ?? me.player.ore,
                x: me.player.x,
                y: me.player.y,
                status: me.player.status,
              }}
              refreshToken={journalTick}
              busy={busy}
              working={Boolean(me.work)}
              onStopWork={onStopWork}
              onNameChange={(name) =>
                setMe((prev) =>
                  prev
                    ? { ...prev, player: { ...prev.player, name } }
                    : prev,
                )
              }
              onEmojiChange={(emoji) => void onEmojiChange(emoji)}
              onBubbleChange={(bubble) => void onBubbleChange(bubble)}
            />
            <OnlinePlayers
              players={onlinePlayers}
              self={{
                id: me.player.id,
                name: me.player.name,
                emoji: me.player.emoji,
                x: me.player.x,
                y: me.player.y,
              }}
              onPlayerClick={(p) =>
                setProfileTarget({
                  id: p.id,
                  name: p.name,
                  emoji: p.emoji,
                  x: p.x,
                  y: p.y,
                  online: true,
                })
              }
            />
          </div>

          <div className="absolute right-4 top-4 z-20">
            <JournalPanel
              refreshToken={journalTick}
              localLogs={localLogs}
              onLocalLogsMatched={onLocalLogsMatched}
              workBusy={workBusy}
              activeWorkBuildingId={me.work?.buildingId ?? null}
              onAcceptWork={onAcceptWorkFromLog}
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
                <FlagCard
                  flag={selection}
                  canRename={selection.ownerId === me.player.id}
                  renaming={busy}
                  onRename={(name) =>
                    void onRenameBuilding(selection.id, name)
                  }
                />
              ) : selection.type === "town" ? (
                <TownCard
                  town={selection}
                  canRename={selection.ownerId === me.player.id}
                  renaming={busy}
                  onRename={(name) =>
                    void onRenameBuilding(selection.id, name)
                  }
                />
              ) : selection.id === me.player.id ? (
                <SelfToolCard
                  name={selection.name}
                  emoji={me.player.emoji}
                  gold={me.player.gold}
                  xp={me.player.xp ?? 0}
                  exploredCells={me.player.exploredCells}
                  stone={me.player.stone}
                  wood={me.player.wood}
                  food={me.player.food}
                  population={me.player.population ?? me.player.ore}
                  x={selection.x}
                  y={selection.y}
                  isLand={selfTerrain?.isLand}
                  tileOccupied={selfOccupied}
                  busy={busy || traveling}
                  onBuildSelect={trySelectBuild}
                />
              ) : (
                <UserCard
                  name={selection.name}
                  playerId={selection.id}
                  emoji={selection.emoji}
                  bubble={selection.bubble}
                  x={selection.x}
                  y={selection.y}
                />
              )}
            </MapPointPopup>
          ) : null}

          <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2">
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
      </div>

      <div className="relative z-10">
        <OpenSourceFooter tone="onDark" />
      </div>

      {pendingBuild ? (
        <BuildNameDialog
          kind={pendingBuild}
          ownerName={me.player.name}
          busy={busy}
          onCancel={() => setPendingBuild(null)}
          onConfirm={(name) => void onConfirmBuild(pendingBuild, name)}
        />
      ) : null}

      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}

      {workOffer ? (
        <WorkOfferModal
          offer={workOffer}
          busy={workBusy}
          onWork={() => void onAcceptWork()}
          onCancel={onCancelWorkOffer}
        />
      ) : null}

      {tollNotices[0] ? (
        <TollNoticeModal
          notice={tollNotices[0]}
          remaining={Math.max(0, tollNotices.length - 1)}
          onDismiss={() => setTollNotices((prev) => prev.slice(1))}
        />
      ) : null}

      {directory === "players" ? (
        <AllPlayersModal
          onClose={() => setDirectory(null)}
          onPlayerClick={(p) => {
            setDirectory(null);
            setProfileTarget({
              id: p.id,
              name: p.name,
              emoji: p.emoji,
              x: p.x,
              y: p.y,
              online: p.online,
            });
          }}
        />
      ) : null}

      {directory === "assets" ? (
        <AllAssetsModal
          onClose={() => setDirectory(null)}
          onOwnerClick={(owner) => {
            setDirectory(null);
            setProfileTarget({
              id: owner.id,
              name: owner.name,
              emoji: owner.emoji,
            });
          }}
        />
      ) : null}

      {profileTarget ? (
        <PlayerProfileModal
          target={profileTarget}
          onClose={() => setProfileTarget(null)}
        />
      ) : null}
    </main>
  );
}
