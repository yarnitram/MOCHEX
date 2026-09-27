import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleDriveConfigured, getSiteWideGoogleDriveToken } from "@/lib/google-drive";

export async function GET() {
  const supabase = await createClient();
  const configured = isGoogleDriveConfigured();
  const siteWide = await getSiteWideGoogleDriveToken(supabase);

  const rawClientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientIdPreview = rawClientId
    ? `${rawClientId.slice(0, 15)}...${rawClientId.slice(-25)} (length: ${rawClientId.length})`
    : null;

  return NextResponse.json({
    configured,
    clientIdPreview,
    siteWideActive: !!siteWide.refreshToken,
    email: siteWide.email,
    isEnv: siteWide.isEnv,
    tokenPreview: siteWide.refreshToken
      ? `${siteWide.refreshToken.slice(0, 10)}...${siteWide.refreshToken.slice(-4)}`
      : null,
    refreshToken: siteWide.refreshToken,
  });
}
