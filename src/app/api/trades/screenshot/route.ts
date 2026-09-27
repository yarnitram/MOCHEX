import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeScreenshotUrl } from "@/lib/screenshot-helpers";
import { uploadImageToGoogleDrive } from "@/lib/google-drive";

/**
 * POST /api/trades/screenshot
 * Supports:
 * 1. JSON payload: { tradeId, url? } (e.g. Google Drive link, TradingView snapshot, or direct image URL)
 * 2. Multipart form data: { file, tradeId } (Uploads directly to Google Drive if connected, saving Supabase quota!)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";

  // CASE 1: Multipart File Upload
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const tradeId = String(formData.get("tradeId") || `new-${Date.now()}`);

      if (!file) {
        return NextResponse.json({ error: "file required" }, { status: 400 });
      }

      // Check if user has Google Drive connected
      const { data: settings } = await supabase
        .from("user_settings")
        .select("google_drive_connected, google_drive_refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      let finalUrl: string;
      let storageType = "supabase";

      if (settings?.google_drive_connected && settings.google_drive_refresh_token) {
        // --- UPLOAD DIRECTLY TO GOOGLE DRIVE (0 BYTES ON SUPABASE!) ---
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `trade-${tradeId}-${Date.now()}.jpg`;
        const { url: gdriveUrl } = await uploadImageToGoogleDrive(
          buffer,
          filename,
          file.type || "image/jpeg",
          settings.google_drive_refresh_token
        );
        finalUrl = gdriveUrl;
        storageType = "google_drive";
      } else {
        // --- FALLBACK TO SUPABASE STORAGE ---
        const buffer = Buffer.from(await file.arrayBuffer());
        const path = `${user.id}/trade-${tradeId}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("trade-screenshots")
          .upload(path, buffer, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          return NextResponse.json({ error: uploadError.message }, { status: 400 });
        }

        const { data: pub } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
        finalUrl = pub.publicUrl;
      }

      // Upsert into trade_notes if existing trade
      if (!tradeId.startsWith("new-")) {
        const { error: noteErr } = await supabase.from("trade_notes").upsert(
          { trade_id: tradeId, screenshot_url: finalUrl },
          { onConflict: "trade_id" }
        );

        if (noteErr) {
          return NextResponse.json({ error: noteErr.message }, { status: 400 });
        }
      }

      return NextResponse.json({ ok: true, url: finalUrl, storage: storageType });
    } catch (err) {
      console.error("Screenshot upload error:", err);
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // CASE 2: JSON Payload with URL (Google Drive link, TradingView snapshot, or clear)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const tradeId = String(b.tradeId ?? "");
  const rawUrl = b.url ? String(b.url) : null;
  if (!tradeId) return NextResponse.json({ error: "tradeId required" }, { status: 400 });

  // Normalize URL (e.g. converts Google Drive share URLs to direct CDN embed link)
  const url = rawUrl ? normalizeScreenshotUrl(rawUrl) : null;

  // Verify the trade belongs to the user
  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .single();
  if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

  // Upsert a notes row carrying the screenshot URL
  if (url) {
    const { error } = await supabase.from("trade_notes").upsert(
      { trade_id: tradeId, screenshot_url: url },
      { onConflict: "trade_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    // Clear the screenshot but keep any existing thesis/review notes
    const { data: existing } = await supabase
      .from("trade_notes")
      .select("*")
      .eq("trade_id", tradeId)
      .single();
    const { error } = await supabase
      .from("trade_notes")
      .update({ screenshot_url: null })
      .eq("trade_id", tradeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (existing && !existing.pre_trade_thesis && !existing.post_trade_review) {
      await supabase.from("trade_notes").delete().eq("trade_id", tradeId);
    }
  }

  return NextResponse.json({ ok: true, url });
}