import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Only ever set below, in the one verified-admin branch — every other path
// through this function strips it, so a client can never forge it and have
// it reach a page render. See lib/auth/session.ts for the consumer side.
const PROFILE_HEADER = "x-profile";

export async function proxy(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginRoute = pathname === "/login";

  if (isAdminRoute) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile?.active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("erro", "conta_desativada");
      return NextResponse.redirect(url);
    }

    // Forward the already-verified profile to the Server Component render
    // so app/admin/layout.tsx and every admin page skip re-running
    // auth.getUser() plus a profile select — two more sequential round
    // trips to Supabase on every single navigation otherwise.
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set(PROFILE_HEADER, JSON.stringify(profile));
    const adminResponse = NextResponse.next({ request: { headers: forwardedHeaders } });
    response.cookies.getAll().forEach((cookie) => adminResponse.cookies.set(cookie));
    return adminResponse;
  }

  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
  }

  if (request.headers.has(PROFILE_HEADER)) {
    const sanitizedHeaders = new Headers(request.headers);
    sanitizedHeaders.delete(PROFILE_HEADER);
    const sanitizedResponse = NextResponse.next({ request: { headers: sanitizedHeaders } });
    response.cookies.getAll().forEach((cookie) => sanitizedResponse.cookies.set(cookie));
    return sanitizedResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
