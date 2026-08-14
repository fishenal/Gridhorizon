import { auth } from "@/lib/auth";
import { AuthPanel } from "@/components/AuthPanel";
import { OpenSourceFooter } from "@/components/OpenSourceFooter";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/play");

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Image
          src="/home-ocean-horizon.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/75 via-stone-950/45 to-stone-950/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/50 via-transparent to-stone-950/30" />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-20">
        <p className="text-sm font-medium tracking-[0.2em] text-teal-200/90 uppercase">
          Gridhorizon
        </p>
        <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
          Asynchronous exploration across thousands of tiles
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-stone-200">
          A procedural world with offline travel settlement, fog of war, and
          waypoint intel. Start from the center and measure distance in real
          time.
        </p>
        <AuthPanel />
      </div>
      <div className="relative z-10">
        <OpenSourceFooter tone="onDark" />
      </div>
    </main>
  );
}
