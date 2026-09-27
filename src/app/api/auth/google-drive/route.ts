import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl, isGoogleDriveConfigured } from "@/lib/google-drive";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings", request.url));
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?error=Google+Drive+is+not+configured+in+environment", request.url)
    );
  }

  const { origin } = new URL(request.url);
  const redirectUri = `${origin}/api/auth/google-drive/callback`;
  const authUrl = getGoogleAuthUrl(redirectUri, user.id);

  return NextResponse.redirect(authUrl);
}
