import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

/**
 * Carries the refreshed auth cookies from `updateSession` onto a redirect.
 * Without this the rotated token is dropped and the user bounces straight
 * back here on the next request.
 */
function redirectWithSession(url: URL, supabaseResponse: NextResponse) {
  const res = NextResponse.redirect(url);

  supabaseResponse.cookies.getAll().forEach(cookie => {
    res.cookies.set(cookie);
  });

  return res;
}

// routes reachable without a session - everything else requires a logged-in user
const publicRoutes = [
  "/login",
  "/sign-up",
  "/forgot-password",
  // reset-password owns its own redirect (see app/reset-password/layout.tsx),
  // so let it through rather than sending expired recovery links to /login
  "/reset-password",
  "/auth",
  "/api",
  "/error",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { user, supabaseResponse } = await updateSession(request);

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // public route: refresh the session and continue
  if (isPublicRoute) {
    return supabaseResponse;
  }

  // not logged in: send to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return redirectWithSession(loginUrl, supabaseResponse);
  }

  /**
   * Onboarding gate - uncomment once your project has an `/onboarding` route.
   * Set `onboarding_complete` on the user's metadata when they finish the flow,
   * and add '/onboarding' to `publicRoutes` only if it should be reachable
   * without a session.
   *
   * const onboardingComplete = user.user_metadata?.onboarding_complete === true;
   *
   * if (!onboardingComplete && pathname !== '/onboarding') {
   *   const onboardingUrl = new URL('/onboarding', request.url);
   *   return redirectWithSession(onboardingUrl, supabaseResponse);
   * }
   *
   * if (onboardingComplete && pathname === '/onboarding') {
   *   const homeUrl = new URL('/', request.url);
   *   return redirectWithSession(homeUrl, supabaseResponse);
   * }
   */

  // all checks passed, update session and continue
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
