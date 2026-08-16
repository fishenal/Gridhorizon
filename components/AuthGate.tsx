"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  clearAccountHint,
  clearGuestCredentials,
  loadAccountHint,
  loadGuestCredentials,
  saveAccountHint,
  saveGuestCredentials,
  type GuestCredentials,
} from "@/lib/game/guestIdentity";

async function mintGuestCredentials(): Promise<GuestCredentials> {
  const res = await fetch("/api/auth/guest", { method: "POST" });
  const data = (await res.json().catch(() => null)) as {
    name?: string;
    token?: string;
    error?: string;
  } | null;
  if (!res.ok || !data?.name || !data?.token) {
    throw new Error(data?.error ?? "Could not create traveler");
  }
  const creds = { name: data.name, token: data.token };
  saveGuestCredentials(creds);
  clearAccountHint();
  return creds;
}

async function signInAsGuest(creds: GuestCredentials) {
  return signIn("credentials", {
    name: creds.name,
    password: creds.token,
    redirect: false,
  });
}

type View = "checking" | "choose" | "login" | "busy" | "error";

/**
 * Entry gate: silent-restore returning guests; otherwise Login | Just try.
 * No auto-mint — Just try is explicit.
 */
export function AuthGate() {
  const router = useRouter();
  const [view, setView] = useState<View>("checking");
  const [error, setError] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const guest = loadGuestCredentials();
      if (!guest) {
        const hint = loadAccountHint();
        if (hint) setLoginName(hint.name);
        setView("choose");
        return;
      }

      setView("busy");
      try {
        let res = await signInAsGuest(guest);
        if (res?.error) {
          // Stale token (claimed / wiped) — fall through to chooser.
          clearGuestCredentials();
          const hint = loadAccountHint();
          if (hint) setLoginName(hint.name);
          setView("choose");
          return;
        }
        router.replace("/play");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not enter the world");
        setView("error");
      }
    })();
  }, [router]);

  async function onJustTry() {
    setError("");
    setView("busy");
    try {
      clearAccountHint();
      const creds = await mintGuestCredentials();
      const res = await signInAsGuest(creds);
      if (res?.error) {
        setError("Could not enter the world. Please try again.");
        setView("error");
        return;
      }
      router.replace("/play");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create traveler");
      setView("error");
    }
  }

  async function onLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const name = loginName.trim();
    if (!name || !loginPassword) {
      setError("Enter username and password");
      return;
    }
    setView("busy");
    try {
      const res = await signIn("credentials", {
        name,
        password: loginPassword,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid username or password");
        setView("login");
        return;
      }
      clearGuestCredentials();
      saveAccountHint({ name });
      router.replace("/play");
      router.refresh();
    } catch {
      setError("Could not log in");
      setView("login");
    }
  }

  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur-md"
      role="dialog"
      aria-labelledby="auth-gate-title"
    >
      <div className="border-b border-stone-100 px-5 py-4">
        <p className="text-[11px] font-medium tracking-[0.18em] text-teal-800 uppercase">
          Gridhorizon
        </p>
        <h1
          id="auth-gate-title"
          className="mt-1 text-lg font-semibold leading-snug text-stone-900"
        >
          {view === "login"
            ? "Log in"
            : "Welcome to a vast and lonely world"}
        </h1>
      </div>

      <div className="px-5 py-4">
        {view === "checking" || view === "busy" ? (
          <p className="text-sm text-stone-600">
            {view === "checking" ? "Checking…" : "Entering…"}
          </p>
        ) : null}

        {view === "error" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError("");
                setView("choose");
              }}
              className="rounded-lg bg-teal-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              Back
            </button>
          </div>
        ) : null}

        {view === "choose" ? (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setError("");
                setView("login");
              }}
              className="rounded-lg bg-teal-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => void onJustTry()}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              Just try
            </button>
            <p className="mt-1 text-xs text-stone-500">
              Just try creates a traveler on this device. You can set a lasting
              login later from the gear next to your name.
            </p>
          </div>
        ) : null}

        {view === "login" ? (
          <form onSubmit={onLoginSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-600">
                Username
              </span>
              <input
                type="text"
                autoComplete="username"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                maxLength={24}
                autoFocus
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-700"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-600">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                maxLength={72}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-700"
              />
            </label>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <button
              type="submit"
              className="rounded-lg bg-teal-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              Enter
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setLoginPassword("");
                setView("choose");
              }}
              className="text-left text-xs text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
            >
              Back
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
