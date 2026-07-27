"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const reg = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    const data = await reg.json();
    if (!reg.ok) {
      setLoading(false);
      setError(data.error ?? "注册失败");
      return;
    }
    const res = await signIn("credentials", {
      name,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("注册成功但登录失败，请手动登录");
      return;
    }
    router.push("/play");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm tracking-wide text-teal-700">Gridhorizon</p>
        <h1 className="mt-1 text-3xl font-semibold text-stone-900">注册</h1>
        <p className="mt-2 text-stone-600">
          出生在地图中心 (4000, 4000)，初始 200 金币。
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          玩家名
          <input
            className="rounded border border-stone-300 bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={24}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          密码
          <input
            type="password"
            className="rounded border border-stone-300 bg-white px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={4}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-teal-800 px-4 py-2.5 text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? "创建中…" : "开始探索"}
        </button>
      </form>
      <p className="text-sm text-stone-600">
        已有账号？{" "}
        <Link href="/login" className="text-teal-800 underline">
          登录
        </Link>
      </p>
    </main>
  );
}
