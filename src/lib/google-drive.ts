/**
 * Google Drive OAuth & Direct Upload Utilities.
 * Uses native standard fetch for maximum performance and zero dependency bloat.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

export const GOOGLE_DRIVE_FOLDER_NAME = "Mochex Trade Screenshots";

export function isGoogleDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Generate Google OAuth 2.0 authorization URL.
 */
export function getGoogleAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured in .env.local");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange authorization code for access and refresh tokens.
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google Drive OAuth credentials are not configured in environment");
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error_description || errorData.error || "Failed to exchange authorization code");
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

/**
 * Retrieve user email using access token.
 */
export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google Drive OAuth credentials missing");
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error_description || errorData.error || "Failed to refresh Google access token");
  }

  const data = await res.json();
  return data.access_token as string;
}

/**
 * Ensure the designated screenshot folder exists on the trader's Google Drive.
 */
async function ensureScreenshotFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(`name='${GOOGLE_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const listRes = await fetch(`${GOOGLE_DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listRes.ok) {
    const data = await listRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create folder if not found
  const createRes = await fetch(`${GOOGLE_DRIVE_API_BASE}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    throw new Error("Failed to create screenshot folder on Google Drive");
  }

  const folder = await createRes.json();
  return folder.id;
}

/**
 * Upload an image file buffer directly into the trader's Google Drive.
 * Automatically makes it link-accessible and returns the high-speed CDN embed URL.
 */
export async function uploadImageToGoogleDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  refreshToken: string
): Promise<{ fileId: string; url: string }> {
  // 1. Refresh access token
  const accessToken = await refreshGoogleAccessToken(refreshToken);

  // 2. Ensure destination folder
  const folderId = await ensureScreenshotFolder(accessToken);

  // 3. Construct multipart upload payload
  const boundary = "-------MochexDriveBoundary" + Math.random().toString(36).substring(2);
  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
    mimeType: mimeType || "image/jpeg",
  });

  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaHeader = `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}`;
  const fileHeader = `Content-Type: ${mimeType || "image/jpeg"}\r\n\r\n`;

  const payload = Buffer.concat([
    Buffer.from(delimiter + metaHeader + delimiter + fileHeader),
    buffer,
    Buffer.from(closeDelimiter),
  ]);

  const uploadRes = await fetch(GOOGLE_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(payload.length),
    },
    body: payload,
  });

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to upload file to Google Drive");
  }

  const uploadedFile = await uploadRes.json();
  const fileId = uploadedFile.id;

  // 4. Set permission to reader for anyone with link
  try {
    await fetch(`${GOOGLE_DRIVE_API_BASE}/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    });
  } catch (permErr) {
    console.warn("Could not set public permission on Google Drive file:", permErr);
  }

  // 5. Return Google CDN high-speed embed URL
  const cdnUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
  return { fileId, url: cdnUrl };
}

/**
 * Get active Site-Wide Google Drive Refresh Token.
 * Resolution priority:
 * 1. process.env.GOOGLE_DRIVE_REFRESH_TOKEN (from .env.local or production host)
 * 2. Supabase user_settings where google_drive_connected = true and google_drive_refresh_token is not null
 */
export async function getSiteWideGoogleDriveToken(supabase?: any): Promise<{
  refreshToken: string | null;
  email: string | null;
  isEnv: boolean;
}> {
  // 1. Check environment variable
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_REFRESH_TOKEN.trim() !== "") {
    return {
      refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN.trim(),
      email: process.env.GOOGLE_DRIVE_EMAIL || null,
      isEnv: true,
    };
  }

  // 2. Check database
  if (supabase) {
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("google_drive_refresh_token, google_drive_email")
        .eq("google_drive_connected", true)
        .not("google_drive_refresh_token", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.google_drive_refresh_token) {
        return {
          refreshToken: data.google_drive_refresh_token,
          email: data.google_drive_email || null,
          isEnv: false,
        };
      }
    } catch (e) {
      console.warn("Could not query site-wide Google Drive token from database:", e);
    }
  }

  return { refreshToken: null, email: null, isEnv: false };
}

/**
 * Persist site-wide refresh token locally to .env.local if running in a Node environment.
 */
export async function syncTokenToEnvLocal(refreshToken: string, email?: string | null): Promise<boolean> {
  try {
    if (typeof window !== "undefined") return false;
    const fs = await import("fs");
    const path = await import("path");
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return false;

    let content = fs.readFileSync(envPath, "utf8");
    if (content.includes("GOOGLE_DRIVE_REFRESH_TOKEN=")) {
      content = content.replace(/GOOGLE_DRIVE_REFRESH_TOKEN=.*/g, `GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}`);
    } else {
      content = content.trim() + `\nGOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken}\n`;
    }

    if (email) {
      if (content.includes("GOOGLE_DRIVE_EMAIL=")) {
        content = content.replace(/GOOGLE_DRIVE_EMAIL=.*/g, `GOOGLE_DRIVE_EMAIL=${email}`);
      } else {
        content = content.trim() + `\nGOOGLE_DRIVE_EMAIL=${email}\n`;
      }
    }

    fs.writeFileSync(envPath, content, "utf8");
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = refreshToken;
    if (email) process.env.GOOGLE_DRIVE_EMAIL = email;
    return true;
  } catch (err) {
    console.warn("Could not write GOOGLE_DRIVE_REFRESH_TOKEN to .env.local:", err);
    return false;
  }
}

/**
 * Remove token from .env.local on disconnect.
 */
export async function removeTokenFromEnvLocal(): Promise<boolean> {
  try {
    if (typeof window !== "undefined") return false;
    const fs = await import("fs");
    const path = await import("path");
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return false;

    let content = fs.readFileSync(envPath, "utf8");
    content = content.replace(/GOOGLE_DRIVE_REFRESH_TOKEN=.*\n?/g, "");
    content = content.replace(/GOOGLE_DRIVE_EMAIL=.*\n?/g, "");
    fs.writeFileSync(envPath, content, "utf8");

    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    delete process.env.GOOGLE_DRIVE_EMAIL;
    return true;
  } catch {
    return false;
  }
}

