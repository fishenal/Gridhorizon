import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_VALUE,
  expectedAccessCode,
} from "@/lib/access";

export async function POST(req: Request) {
  let code = "";
  try {
    const body = (await req.json()) as { code?: string };
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (code !== expectedAccessCode()) {
    return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, ACCESS_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
