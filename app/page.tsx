import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { ACCESS_COOKIE, ACCESS_COOKIE_VALUE } from "@/lib/access";
import { AccessGateForm } from "@/components/AccessGateForm";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const jar = await cookies();
  const gated = jar.get(ACCESS_COOKIE)?.value === ACCESS_COOKIE_VALUE;
  const session = await auth();
  if (session?.user && gated) redirect("/play");

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,80,70,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(15,80,70,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-20">
        <p className="text-sm font-medium tracking-[0.2em] text-teal-800 uppercase">
          Gridhorizon
        </p>
        <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-5xl">
          横跨五千格的异步探索
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-stone-700">
          程序化世界、离线行进结算、迷雾与路标情报。从中心出发，用真实时间丈量距离。
        </p>
        <AccessGateForm />
      </div>
    </main>
  );
}
