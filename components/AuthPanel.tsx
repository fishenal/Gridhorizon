"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "login" | "register";

export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "register") {
      const reg = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = (await reg.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!reg.ok) {
        setLoading(false);
        setError(data?.error ?? "Registration failed");
        return;
      }
    }

    const res = await signIn("credentials", {
      name,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(
        mode === "register"
          ? "Registered, but login failed. Please try logging in."
          : "Login failed. Check your username or password.",
      );
      return;
    }
    router.push("/play");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-white/20 bg-white/90 p-4 shadow-xl backdrop-blur-md">
      <div className="mb-4 flex gap-1 rounded-lg border border-stone-200 bg-stone-50/80 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
            mode === "login"
              ? "bg-teal-900 text-white"
              : "text-stone-600 hover:bg-stone-50"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError("");
          }}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
            mode === "register"
              ? "bg-teal-900 text-white"
              : "text-stone-600 hover:bg-stone-50"
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-stone-700">
          Player name
          <input
            className="rounded border border-stone-300 bg-white/80 px-3 py-2 text-stone-900 outline-none focus:border-teal-700"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            minLength={mode === "register" ? 2 : undefined}
            maxLength={24}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-stone-700">
          Password
          <input
            type="password"
            className="rounded border border-stone-300 bg-white/80 px-3 py-2 text-stone-900 outline-none focus:border-teal-700"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            minLength={mode === "register" ? 4 : undefined}
            required
          />
        </label>
        {mode === "register" ? (
          <p className="text-xs text-stone-500">
            Spawn at map center (4000, 4000) with 200 gold.
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-teal-900 px-5 py-2.5 text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {loading
            ? mode === "register"
              ? "Creating…"
              : "Logging in…"
            : mode === "register"
              ? "Start exploring"
              : "Log in"}
        </button>
      </form>
    </div>
  );
}
