import { auth } from "./auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/invite", "/forgot-password", "/reset-password"];
const MANAGER_ONLY_PATHS = ["/settings", "/inventory"];
const SETUP_PATHS = ["/setup"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow API auth routes
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // 1. Require authentication
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 2. Check isActive
  if (!req.auth.user.isActive) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 3. Check mustChangePassword — redirect to /change-password
  if (req.auth.user.mustChangePassword && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // 4. Template setup check — managers without template go to /setup
  if (
    req.auth.user.role === "MANAGER" &&
    !req.auth.user.templateSelected &&
    !SETUP_PATHS.some((p) => pathname.startsWith(p)) &&
    pathname !== "/change-password"
  ) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  // 5. If template is selected, don't let them go back to /setup
  if (
    req.auth.user.templateSelected &&
    SETUP_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 6. Role-based route blocking: Staff cannot access manager-only paths
  if (
    req.auth.user.role === "STAFF" &&
    MANAGER_ONLY_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.json|sw.js|.*\\.png$).*)",
  ],
};
