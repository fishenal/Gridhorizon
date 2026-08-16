export const GUEST_STORAGE_KEY = "gridhorizon.guest.v1";
/** Remembers a claimed username (no password) so home can offer login instead of minting a new guest. */
export const ACCOUNT_HINT_KEY = "gridhorizon.account.v1";

export type GuestCredentials = {
  name: string;
  token: string;
};

export type AccountHint = {
  name: string;
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

export function loadAccountHint(): AccountHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountHint>;
    const name = String(parsed.name ?? "").trim();
    if (!name) return null;
    return { name };
  } catch {
    return null;
  }
}

export function saveAccountHint(hint: AccountHint): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ACCOUNT_HINT_KEY,
    JSON.stringify({ name: hint.name }),
  );
}

export function clearAccountHint(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCOUNT_HINT_KEY);
}

/** True when this browser still holds a guest token for the given player name. */
export function isDeviceGuest(playerName: string): boolean {
  const creds = loadGuestCredentials();
  return Boolean(creds && creds.name === playerName);
}
