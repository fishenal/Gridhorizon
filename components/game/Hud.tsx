"use client";

type PlayerState = {
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

type Travel = {
  etaSeconds: number;
  target: { x: number; y: number };
} | null;

export function Hud({
  player,
  travel,
  travelSecondsPerTile,
  onSignOut,
}: {
  player: PlayerState;
  travel: Travel;
  travelSecondsPerTile: number;
  onSignOut: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-300/80 bg-white/70 px-4 py-3 backdrop-blur">
      <div>
        <p className="text-xs tracking-wider text-teal-800 uppercase">
          Gridhorizon
        </p>
        <h1 className="text-lg font-semibold">{player.name}</h1>
        <p className="text-sm text-stone-600">
          ({player.x}, {player.y}) · {player.status}
          {travel
            ? ` · 前往 (${travel.target.x},${travel.target.y}) 约 ${travel.etaSeconds}s`
            : ""}
        </p>
        <p className="text-xs text-stone-500">
          每格 {travelSecondsPerTile}s（测服可改为 3）
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span>金 {player.gold}</span>
        <span>石 {player.stone}</span>
        <span>木 {player.wood}</span>
        <span>矿 {player.ore}</span>
        <span>食 {player.food}</span>
        <button
          type="button"
          onClick={onSignOut}
          className="text-teal-900 underline"
        >
          退出
        </button>
      </div>
    </header>
  );
}
