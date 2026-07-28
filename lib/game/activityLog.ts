import type { Db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";

export type ActivityPoint = { x: number; y: number };

export type ActivityType =
  | "travel_start"
  | "travel_stop"
  | "travel_arrive"
  | "build"
  | (string & {});

export type TravelStartPayload = {
  from: ActivityPoint;
  to: ActivityPoint;
  steps: number;
};

export type TravelEndPayload = {
  at: ActivityPoint;
  from?: ActivityPoint;
  to?: ActivityPoint;
};

export type BuildPayload = {
  buildingType: string;
  name: string | null;
  x: number;
  y: number;
  buildingId?: number;
};

export async function appendActivityLog(
  db: Db,
  args: {
    playerId: number;
    mapId: number;
    type: ActivityType;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(activityLogs).values({
    playerId: args.playerId,
    mapId: args.mapId,
    type: args.type,
    payload: JSON.stringify(args.payload),
  });
}

export async function logTravelStart(
  db: Db,
  playerId: number,
  mapId: number,
  payload: TravelStartPayload,
): Promise<void> {
  await appendActivityLog(db, {
    playerId,
    mapId,
    type: "travel_start",
    payload,
  });
}

export async function logTravelStop(
  db: Db,
  playerId: number,
  mapId: number,
  payload: TravelEndPayload,
): Promise<void> {
  await appendActivityLog(db, {
    playerId,
    mapId,
    type: "travel_stop",
    payload,
  });
}

export async function logTravelArrive(
  db: Db,
  playerId: number,
  mapId: number,
  payload: TravelEndPayload,
): Promise<void> {
  await appendActivityLog(db, {
    playerId,
    mapId,
    type: "travel_arrive",
    payload,
  });
}

export async function logBuild(
  db: Db,
  playerId: number,
  mapId: number,
  payload: BuildPayload,
): Promise<void> {
  await appendActivityLog(db, {
    playerId,
    mapId,
    type: "build",
    payload,
  });
}
