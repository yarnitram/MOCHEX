import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl, isGoogleDriveConfigured, getOAuthRedirectUri } from "@/lib/google-drive";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectUri = getOAuthRedirectUri(request);
  const baseUrl = redirectUri.replace("/api/auth/google-drive/callback", "");

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings", baseUrl));
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?error=Google+Drive+is+not+configured+in+environment", baseUrl)
    );
  }

  const authUrl = getGoogleAuthUrl(redirectUri, user.id);
  return NextResponse.redirect(authUrl);
}
