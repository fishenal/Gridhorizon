import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_COOKIE_VALUE } from "@/lib/access";

export function middleware(req: NextRequest) {
  const gated = req.cookies.get(ACCESS_COOKIE)?.value === ACCESS_COOKIE_VALUE;
  if (gated) return NextResponse.next();
  return NextResponse.redirect(new URL("/", req.url));
}

export const config = {
  matcher: ["/login", "/register", "/play", "/play/:path*"],
};
