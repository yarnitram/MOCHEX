import { createClient } from "./supabase/client";

const BUCKET = "trade-screenshots";
const MAX_WIDTH = 1200;
const JPEG_QUALITY = 0.8;

/**
 * Compress + resize an image file in the browser, upload it to Supabase
 * Storage under a user-scoped path, and return the public URL.
 */
export async function uploadScreenshot(
  file: File,
  tradeId?: string
): Promise<{ url: string; path: string }> {
  const blob = await compressImage(file);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const stamp = Date.now();
  const seg = tradeId ?? stamp;
  const path = `${user.id}/trade-${seg}-${stamp}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "31536000, immutable",
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl, path };
}

/** Resize to ≤MAX_WIDTH and re-encode as JPEG. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Encoding failed"))),
      "image/jpeg",
      JPEG_QUALITY
    )
  );
  bitmap.close();
  return blob;
}