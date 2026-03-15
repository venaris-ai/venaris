// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = [
  "/home", // vorbereitet für neue Produkt-Startseite
  "/wildlife",
  "/cameras",
  "/orga",
  "/intelligence", // bleibt vorerst bis Wildlife-Neustruktur steht
];

const PROTECTED_EXACT = ["/"];

const AUTH_PAGES = ["/login", "/register"];

function matchesExact(pathname: string, entries: string[]) {
  return entries.includes(pathname);
}

function matchesPrefix(pathname: string, entries: string[]) {
  return entries.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isProtectedPath(pathname: string) {
  return (
    matchesExact(pathname, PROTECTED_EXACT) ||
    matchesPrefix(pathname, PROTECTED_PREFIXES)
  );
}

function isAuthPage(pathname: string) {
  return matchesPrefix(pathname, AUTH_PAGES);
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const protectedPath = isProtectedPath(pathname);
  const authPage = isAuthPage(pathname);

  if (protectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";

    const next = `${pathname}${request.nextUrl.search}`;

    if (next && next !== "/login") {
      url.searchParams.set("next", next);
    }

    return NextResponse.redirect(url);
  }

  if (authPage && user) {
    const url = request.nextUrl.clone();

    // Solange "/" noch die aktuelle Produkt-Startseite ist,
    // bleiben wir im Übergangsmodus bewusst bei "/".
    // Erst wenn /home wirklich live ist und / Marketing wird,
    // stellen wir diesen Redirect auf "/home" um.
    url.pathname = "/";
    url.search = "";

    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};