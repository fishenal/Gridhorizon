import { auth } from "@/lib/auth";
import { AuthGate } from "@/components/AuthGate";
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
          src="/home-ocean-horizon.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/75 via-stone-950/45 to-stone-950/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/50 via-transparent to-stone-950/30" />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <AuthGate />
      </div>
      <div className="relative z-10">
        <OpenSourceFooter tone="onDark" />
      </div>
    </main>
  );
}
