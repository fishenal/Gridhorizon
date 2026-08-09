"use client";

import Ably from "ably";

let client: Ably.Realtime | null = null;

/** Browser Ably client; tokens come from /api/ably/token. Returns null if init fails. */
export function getAblyClient(): Ably.Realtime | null {
  if (typeof window === "undefined") return null;
  if (client) return client;
  try {
    client = new Ably.Realtime({
      authUrl: "/api/ably/token",
      authMethod: "GET",
      autoConnect: true,
    });
    return client;
  } catch {
    return null;
  }
}

export function closeAblyClient(): void {
  if (!client) return;
  try {
    client.close();
  } catch {
    // ignore
  }
  client = null;
}
