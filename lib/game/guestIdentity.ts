export const GUEST_STORAGE_KEY = "gridhorizon.guest.v1";

export type GuestCredentials = {
  name: string;
  token: string;
};

export function loadGuestCredentials(): GuestCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GuestCredentials>;
    const name = String(parsed.name ?? "").trim();
    const token = String(parsed.token ?? "");
    if (!name || !token) return null;
    return { name, token };
  } catch {
    return null;
  }
}

export function saveGuestCredentials(creds: GuestCredentials): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    GUEST_STORAGE_KEY,
    JSON.stringify({ name: creds.name, token: creds.token }),
  );
}

export function clearGuestCredentials(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_STORAGE_KEY);
}
