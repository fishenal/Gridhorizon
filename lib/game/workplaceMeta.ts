import { WORKPLACE_TYPES, type WorkplaceType } from "@/lib/game/structureSpacing";

export type WorkResource = "stone" | "wood" | "food";

export type WorkJobView = {
  buildingId: number;
  buildingType: WorkplaceType;
  buildingName: string | null;
  ownerId: number;
  ownerName: string;
  x: number;
  y: number;
  radius: number;
  startedAt: string;
};

export type WorkplaceWorker = {
  playerId: number;
  name: string;
  emoji: string;
  startedAt: string;
};

export function workResourceForType(type: string): WorkResource | null {
  if (type === "mine") return "stone";
  if (type === "lumber") return "wood";
  if (type === "farm") return "food";
  return null;
}

export function workplaceLabel(type: string): string {
  if (type === "mine") return "Quarry";
  if (type === "lumber") return "Lumber camp";
  if (type === "farm") return "Farm";
  return "Workplace";
}

export function isWorkplaceBuildingType(type: string): type is WorkplaceType {
  return (WORKPLACE_TYPES as readonly string[]).includes(type as WorkplaceType);
}
