import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeScreenshotUrl } from "@/lib/screenshot-helpers";
import { uploadImageToGoogleDrive, getSiteWideGoogleDriveToken } from "@/lib/google-drive";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB safety limit

/**
 * POST /api/trades/screenshot/download-url
 * Downloads a remote image from a URL (server-side, bypassing CORS), then stores it
 * in Google Drive (or Supabase fallback) and returns the hosted URL.
 *
 * Request body: { tradeId: string, imageUrl: string }
 * Response:     { ok: true, url: string, storage: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const tradeId = String(b.tradeId ?? `screenshot-${Date.now()}`);
  const rawImageUrl = b.imageUrl ? String(b.imageUrl).trim() : null;

  if (!rawImageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  // Normalize URL first (handles TradingView snapshots, Google Drive links, etc.)
  const normalizedUrl = normalizeScreenshotUrl(rawImageUrl);
  if (!normalizedUrl) {
    return NextResponse.json({ error: "Invalid or unsupported URL" }, { status: 400 });
  }

  // Validate URL structure
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return NextResponse.json({ error: "Malformed URL" }, { status: 400 });
  }

  // Only allow http/https
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTP/HTTPS URLs are supported" }, { status: 400 });
  }

  // Fetch the remote image (server-side, bypasses CORS)
  let fetchResponse: Response;
  try {
    fetchResponse = await fetch(normalizedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Mochex/1.0; +https://mochex.app)",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[download-url] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach the remote URL. It may be unavailable or blocked." },
      { status: 502 }
    );
  }

  if (!fetchResponse.ok) {
    return NextResponse.json(
      { error: `Remote server returned ${fetchResponse.status}. The URL may be private or invalid.` },
      { status: 502 }
    );
  }

  // Validate content type - be lenient (some servers send wrong types)
  const contentType = fetchResponse.headers.get("content-type") || "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (mimeType && !mimeType.includes("image") && !mimeType.includes("octet-stream") && mimeType !== "") {
    return NextResponse.json(
      { error: `URL does not point to an image (got: ${mimeType || "unknown"})` },
      { status: 400 }
    );
  }

  // Read image data
  const arrayBuffer = await fetchResponse.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Remote URL returned an empty response" }, { status: 502 });
  }
  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { error: `Image is too large (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(arrayBuffer);

  // Determine file extension from mime type
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  const ext = extMap[mimeType] || "jpg";
  const filename = `trade-${tradeId}-${Date.now()}.${ext}`;
  const uploadMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";

  // Check for Google Drive token (site-wide first, then per-user)
  const siteWide = await getSiteWideGoogleDriveToken(supabase);
  let effectiveToken = siteWide.refreshToken;

  if (!effectiveToken) {
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("google_drive_connected, google_drive_refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (userSettings?.google_drive_connected && userSettings.google_drive_refresh_token) {
      effectiveToken = userSettings.google_drive_refresh_token;
    }
  }

  let finalUrl: string;
  let storageType = "supabase";

  try {
    if (effectiveToken) {
      const { url: gdriveUrl } = await uploadImageToGoogleDrive(
        buffer,
        filename,
        uploadMime,
        effectiveToken
      );
      finalUrl = gdriveUrl;
      storageType = "google_drive";
    } else {
      const path = `${user.id}/${filename}`;
      const { error: uploadError } = await supabase.storage
        .from("trade-screenshots")
        .upload(path, buffer, {
          contentType: uploadMime,
          upsert: true,
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }

      const { data: pub } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
      finalUrl = pub.publicUrl;
    }
  } catch (err) {
    console.error("[download-url] storage error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: finalUrl, storage: storageType });
}
