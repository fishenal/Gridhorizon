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

export function Hud({
  player,
  onSignOut,
}: {
  player: PlayerState;
  onSignOut: () => void;
}) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white px-3 text-sm text-stone-800">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="font-medium text-stone-900">{player.name}</span>
        <span>金钱{player.gold}</span>
        <span>石{player.stone}</span>
        <span>木{player.wood}</span>
        <span>矿{player.ore}</span>
        <span>食{player.food}</span>
        <span className="text-stone-500">
          ({player.x},{player.y})
        </span>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="shrink-0 text-stone-700 underline hover:text-stone-900"
      >
        退出
      </button>
    </header>
  );
}
