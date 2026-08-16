"use client";

import { signIn, signOut } from "next-auth/react";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  clearAccountHint,
  clearGuestCredentials,
  isDeviceGuest,
  saveAccountHint,
} from "@/lib/game/guestIdentity";
import {
  AVATAR_EMOJI_CHOICES,
  normalizeBubble,
  normalizePlayerEmoji,
} from "@/lib/game/playerStyle";

const BUBBLE_MAX = 300;

type SettingsTab = "style" | "account";

type Props = {
  currentName: string;
  emoji?: string;
  bubble?: string;
  busy?: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
  onEmojiChange?: (emoji: string) => void;
  onBubbleChange?: (bubble: string) => void;
};

export function AccountSettingsModal({
  currentName,
  emoji,
  bubble,
  busy: parentBusy,
  onClose,
  onSaved,
  onEmojiChange,
  onBubbleChange,
}: Props) {
  const titleId = useId();
  const guest = isDeviceGuest(currentName);
  const [tab, setTab] = useState<SettingsTab>("style");
  const [name, setName] = useState(currentName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const face = normalizePlayerEmoji(emoji);
  const [draft, setDraft] = useState(() => normalizeBubble(bubble));

  useEffect(() => {
    setDraft(normalizeBubble(bubble));
  }, [bubble]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !signingOut) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, signingOut]);

  function saveBubble() {
    if (!onBubbleChange) return;
    const next = normalizeBubble(draft);
    if (next === normalizeBubble(bubble)) return;
    onBubbleChange(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError("Name must be 2–24 characters");
      return;
    }
    if (password.length < 4 || password.length > 72) {
      setError("Password must be 4–72 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, password }),
      });
      const data = (await res.json().catch(() => null)) as {
        name?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.name) {
        setError(data?.error ?? "Could not save account");
        return;
      }

      const sign = await signIn("credentials", {
        name: data.name,
        password,
        redirect: false,
      });
      if (sign?.error) {
        setError("Saved, but session refresh failed — try logging in again");
        return;
      }

      clearGuestCredentials();
      saveAccountHint({ name: data.name });
      onSaved(data.name);
    } catch {
      setError("Could not save account");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    setError("");
    try {
      clearGuestCredentials();
      clearAccountHint();
      await signOut({ redirect: false });
      window.location.href = "/";
    } catch {
      setSigningOut(false);
      setError("Could not sign out");
    }
  }

  const locked = busy || signingOut || Boolean(parentBusy);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
      onClick={signingOut ? undefined : onClose}
    >
      <div
        className="flex max-h-[min(85vh,560px)] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div>
            <h2
              id={titleId}
              className="text-base font-semibold text-stone-900"
            >
              Account settings
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              Avatar, message, and login for this traveler.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={signingOut}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-stone-100 px-3 py-2">
          {(
            [
              { id: "style" as const, label: "Style" },
              { id: "account" as const, label: "Login" },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setError("");
                  setTab(item.id);
                }}
                className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                  active
                    ? "bg-stone-100 text-stone-800 ring-1 ring-stone-300"
                    : "text-stone-500 hover:bg-stone-50"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {tab === "style" ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-stone-600">
                  Avatar
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {AVATAR_EMOJI_CHOICES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      disabled={locked || !onEmojiChange}
                      onClick={() => onEmojiChange?.(e)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-base disabled:opacity-40 ${
                        e === face
                          ? "bg-stone-100 ring-1 ring-stone-400"
                          : "hover:bg-stone-50"
                      }`}
                      aria-label={`Choose ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-stone-600">
                    Bubble message
                  </p>
                  <p className="text-[10px] text-stone-400">
                    {draft.length}/{BUBBLE_MAX}
                  </p>
                </div>
                <textarea
                  value={draft}
                  disabled={locked || !onBubbleChange}
                  maxLength={BUBBLE_MAX}
                  rows={4}
                  placeholder="Say something…"
                  onChange={(e) =>
                    setDraft(e.target.value.slice(0, BUBBLE_MAX))
                  }
                  onBlur={saveBubble}
                  className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:border-teal-600 disabled:opacity-40"
                />
                <button
                  type="button"
                  disabled={locked || !onBubbleChange}
                  onClick={saveBubble}
                  className="mt-2 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
                >
                  Save bubble
                </button>
              </div>
            </div>
          ) : null}

          {tab === "account" ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <p className="text-xs text-stone-500">
                {guest
                  ? "Set a username and password to log in on other devices. Progress on this traveler is kept."
                  : "Update your username or password. This device stays signed in."}
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-stone-600">
                  Username
                </span>
                <input
                  type="text"
                  autoComplete="username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-600"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-stone-600">
                  Password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={72}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-600"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-stone-600">
                  Confirm password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  maxLength={72}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-600"
                />
              </label>

              {error ? <p className="text-xs text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={locked}
                className="mt-1 rounded-lg bg-teal-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {busy ? "Saving…" : guest ? "Save login" : "Update"}
              </button>

              <div className="mt-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  disabled={locked}
                  className="w-full rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
                <p className="mt-2 text-[11px] text-stone-400">
                  Clears this device. Next visit asks Login or Just try again.
                </p>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
