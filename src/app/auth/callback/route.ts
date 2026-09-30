import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Auth callback — exchanges an OAuth / magic-link code for a session
 * and stores it in cookies. Kept separate so it can use its own cookie
 * manager without the proxy-opting concerns of the app pages.
 */
function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const protoHeader = request.headers.get("x-forwarded-proto");

  if (host) {
    let cleanHost = host.split(",")[0].trim();
    if (cleanHost.includes("0.0.0.0")) {
      cleanHost = cleanHost.replace("0.0.0.0", "localhost");
    }
    const isLocal = cleanHost.includes("localhost") || cleanHost.includes("127.0.0.1");
    const protocol = isLocal ? (protoHeader || "http") : (protoHeader || "https");
    return `${protocol}://${cleanHost}`;
  }

  const url = new URL(request.url);
  let cleanHost = url.host;
  if (cleanHost.includes("0.0.0.0")) {
    cleanHost = cleanHost.replace("0.0.0.0", "localhost");
  }
  const isLocal = cleanHost.includes("localhost") || cleanHost.includes("127.0.0.1");
  const protocol = isLocal ? url.protocol.replace(":", "") : "https";
  return `${protocol}://${cleanHost}`;
}

/**
 * Auth callback — exchanges an OAuth / magic-link code for a session
 * and stores it in cookies. Kept separate so it can use its own cookie
 * manager without the proxy-opting concerns of the app pages.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/journal";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect the user to an error page with an optional error description.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}