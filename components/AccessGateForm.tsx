"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccessGateForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "访问码不正确");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex max-w-sm flex-col gap-3">
      <label className="text-sm text-stone-700">
        访问码
        <input
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 bg-white/80 px-3 py-2 text-stone-900 outline-none focus:border-teal-700"
          placeholder="输入访问码"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !code.trim()}
        className="rounded bg-teal-900 px-5 py-2.5 text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {loading ? "验证中…" : "进入"}
      </button>
    </form>
  );
}
