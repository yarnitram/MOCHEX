import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleDriveConfigured, getSiteWideGoogleDriveToken } from "@/lib/google-drive";

export async function GET() {
  const supabase = await createClient();
  const configured = isGoogleDriveConfigured();
  const siteWide = await getSiteWideGoogleDriveToken(supabase);

  return NextResponse.json({
    configured,
    siteWideActive: !!siteWide.refreshToken,
    email: siteWide.email,
    isEnv: siteWide.isEnv,
    tokenPreview: siteWide.refreshToken
      ? `${siteWide.refreshToken.slice(0, 10)}...${siteWide.refreshToken.slice(-4)}`
      : null,
    refreshToken: siteWide.refreshToken,
  });
}
