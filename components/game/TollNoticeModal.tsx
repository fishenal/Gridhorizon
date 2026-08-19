"use client";

import { formatTollNotice, type TollNotice } from "@/lib/game/tollNotice";

type Props = {
  notice: TollNotice;
  remaining: number;
  onDismiss: () => void;
};

export function TollNoticeModal({ notice, remaining, onDismiss }: Props) {
  const { title, body } = formatTollNotice(notice);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[180] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-xl"
        role="dialog"
        aria-labelledby="toll-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="toll-notice-title"
          className="text-base font-semibold text-stone-900"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">{body}</p>
        {remaining > 0 ? (
          <p className="mt-2 text-[11px] text-stone-400">
            {remaining} more notice{remaining === 1 ? "" : "s"}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
        >
          OK
        </button>
      </div>
    </div>
  );
}
