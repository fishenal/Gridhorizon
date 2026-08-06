export function mapChannelName(mapId: number): string {
  return `map:${mapId}`;
}

export type PresenceMember = {
  id: number;
  name: string;
  emoji: string;
  bubble?: string;
  x: number;
  y: number;
  status: string;
};

export type PosMessage = {
  type: "pos";
  playerId: number;
  name: string;
  emoji: string;
  bubble?: string;
  x: number;
  y: number;
  status: string;
};

export type BubbleMessage = {
  type: "bubble";
  playerId: number;
  bubble: string;
};

export type BuildMessage = {
  type: "build";
  buildingId?: number;
  buildingType: string;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  ownerEmoji: string;
  name: string | null;
  tollRadius: number | null;
};

export type TollMessage = {
  type: "toll";
  toPlayerId: number;
  amount: number;
};

export type MapRealtimeMessage =
  | PosMessage
  | BubbleMessage
  | BuildMessage
  | TollMessage;

export function isMapRealtimeMessage(v: unknown): v is MapRealtimeMessage {
  if (!v || typeof v !== "object") return false;
  const t = (v as { type?: unknown }).type;
  return t === "pos" || t === "bubble" || t === "build" || t === "toll";
}
