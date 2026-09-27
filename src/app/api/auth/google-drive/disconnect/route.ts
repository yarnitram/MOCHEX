import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { removeTokenFromEnvLocal } from "@/lib/google-drive";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Remove from database
  const { error } = await supabase
    .from("user_settings")
    .update({
      google_drive_connected: false,
      google_drive_email: null,
      google_drive_refresh_token: null,
      screenshot_storage_backend: "supabase",
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 2. Remove from .env.local if present
  await removeTokenFromEnvLocal();

  return NextResponse.json({ ok: true });
}

