import { NextResponse, type NextRequest } from "next/server";
import { RequestSession } from "@/catalyst/request-session";
import { WebPath } from "@/web-path";

/** The pages a visitor reaches signed out. Every other page needs a signed-in user. */
const SIGNED_OUT_PAGES: readonly string[] = [WebPath.SignIn, WebPath.SignUp];

/**
 * Sends a visitor to the side of the app that matches their sign-in state, before any layout
 * or page renders. It reads only the header Catalyst stamps and makes no Catalyst call, so it
 * protects no data: each page and action still names its scopes, and that is the check.
 */
export function proxy(request: NextRequest): NextResponse {
  const isSignedIn = RequestSession.isSignedIn(request.headers);
  const isSignedOutPage = SIGNED_OUT_PAGES.includes(request.nextUrl.pathname);
  if (!isSignedIn && !isSignedOutPage) {
    return NextResponse.redirect(new URL(WebPath.SignIn, request.url));
  }
  if (isSignedIn && isSignedOutPage) {
    return NextResponse.redirect(new URL(WebPath.Home, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Next's assets and any path with an extension skip it - public/catalyst-signin.css is
  // loaded by the sign-in widget before anyone is signed in.
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
