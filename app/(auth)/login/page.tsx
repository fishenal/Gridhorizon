"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      name,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("登录失败，请检查用户名或密码");
      return;
    }
    router.push("/play");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm tracking-wide text-teal-700">Gridhorizon</p>
        <h1 className="mt-1 text-3xl font-semibold text-stone-900">登录</h1>
        <p className="mt-2 text-stone-600">继续你的远征。</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          玩家名
          <input
            className="rounded border border-stone-300 bg-white px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
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
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-teal-800 px-4 py-2.5 text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
      <p className="text-sm text-stone-600">
        还没有账号？{" "}
        <Link href="/register" className="text-teal-800 underline">
          注册
        </Link>
      </p>
    </main>
  );
}
