"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearGuestCredentials,
  loadGuestCredentials,
  saveGuestCredentials,
  type GuestCredentials,
} from "@/lib/game/guestIdentity";

async function ensureGuestCredentials(): Promise<GuestCredentials> {
  const existing = loadGuestCredentials();
  if (existing) return existing;

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
  return creds;
}

async function signInAsGuest(creds: GuestCredentials) {
  return signIn("credentials", {
    name: creds.name,
    password: creds.token,
    redirect: false,
  });
}

/** Auto-creates / restores a guest and enters /play. */
export function GuestEntry() {
  const router = useRouter();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        let creds = await ensureGuestCredentials();
        let res = await signInAsGuest(creds);

        // Stale local token (DB wiped / old account) → mint a new guest.
        if (res?.error) {
          clearGuestCredentials();
          creds = await ensureGuestCredentials();
          res = await signInAsGuest(creds);
        }

        if (res?.error) {
          setError("Could not enter the world. Please refresh.");
          return;
        }

        router.replace("/play");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not enter the world");
      }
    })();
  }, [router]);

  return (
    <div className="w-full max-w-sm rounded-xl border border-white/20 bg-white/90 p-4 shadow-xl backdrop-blur-md">
      {error ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              started.current = false;
              window.location.reload();
            }}
            className="rounded bg-teal-900 px-5 py-2.5 text-white hover:bg-teal-800"
          >
            Try again
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-700">Entering the world…</p>
      )}
    </div>
  );
}
