import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PlayClient from "./PlayClient";

export default async function PlayRoute() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return <PlayClient />;
}
