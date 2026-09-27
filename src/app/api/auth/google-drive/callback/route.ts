import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, getGoogleUserEmail, syncTokenToEnvLocal } from "@/lib/google-drive";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error || "Authorization cancelled")}`, origin)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings", origin));
  }

  try {
    const redirectUri = `${origin}/api/auth/google-drive/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const email = tokens.access_token ? await getGoogleUserEmail(tokens.access_token) : null;

    // 1. Save refresh token to user_settings (accessible database record)
    const updateData: Record<string, unknown> = {
      user_id: user.id,
      google_drive_connected: true,
      google_drive_email: email,
      screenshot_storage_backend: "google_drive",
    };

    if (tokens.refresh_token) {
      updateData.google_drive_refresh_token = tokens.refresh_token;
      // 2. Also sync to .env.local so it acts as global site-wide environment variable!
      await syncTokenToEnvLocal(tokens.refresh_token, email);
    }

    const { error: upsertErr } = await supabase
      .from("user_settings")
      .upsert(updateData, { onConflict: "user_id" });

    if (upsertErr) {
      console.warn("Could not save Google Drive credentials to user_settings:", upsertErr.message);
    }

    const tokenQuery = tokens.refresh_token ? `&token=${encodeURIComponent(tokens.refresh_token)}` : "";
    const emailQuery = email ? `&email=${encodeURIComponent(email)}` : "";
    return NextResponse.redirect(new URL(`/settings?gdrive=connected_site${emailQuery}${tokenQuery}`, origin));
  } catch (err) {
    console.error("Google Drive OAuth error:", err);
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent((err as Error).message)}`, origin)
    );
  }
}

