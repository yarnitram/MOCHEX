/**
 * Helpers for screenshot link normalization, Google Drive detection, and clipboard handling.
 */

/**
 * Check if a URL points to Google Drive.
 */
export function isGoogleDriveUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /drive\.google\.com|docs\.google\.com/i.test(url);
}

/**
 * Extract Google Drive File ID from various link formats:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch && fileMatch[1]) return fileMatch[1];

  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idMatch && idMatch[1]) return idMatch[1];

  return null;
}

/**
 * Normalize a screenshot URL into a high-speed direct image embed URL.
 * Automatically handles:
 * - Google Drive share links -> converts to https://lh3.googleusercontent.com/d/FILE_ID
 * - TradingView snapshot share links -> converts to direct PNG image
 * - Direct image links (PNG, JPG, WEBP, GIF, Supabase Storage) -> returns clean trimmed URL
 */
export function normalizeScreenshotUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();

  // 1. Google Drive Share Link
  const gdriveId = extractGoogleDriveFileId(trimmed);
  if (gdriveId) {
    return `https://lh3.googleusercontent.com/d/${gdriveId}`;
  }

  // 2. TradingView Snapshot Link (e.g. https://www.tradingview.com/x/abcdefg/)
  const tvMatch = trimmed.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/i);
  if (tvMatch && tvMatch[1]) {
    const code = tvMatch[1];
    const initial = code[0].toLowerCase();
    return `https://s3.tradingview.com/snapshots/${initial}/${code}.png`;
  }

  return trimmed;
}

/**
 * Extract an image File from a browser ClipboardEvent if present.
 */
export function getImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
