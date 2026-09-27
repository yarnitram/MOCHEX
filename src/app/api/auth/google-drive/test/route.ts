import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSiteWideGoogleDriveToken,
  testGoogleDriveUpload,
  getScreenshotFolderInfo,
} from "@/lib/google-drive";

/**
 * GET /api/auth/google-drive/test
 * Returns current folder info (folderId and folderUrl) if connected.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { refreshToken } = await getSiteWideGoogleDriveToken(supabase);
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Drive is not connected yet.", connected: false },
        { status: 400 }
      );
    }

    const folderInfo = await getScreenshotFolderInfo(refreshToken);
    return NextResponse.json({
      connected: true,
      ...folderInfo,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to inspect Google Drive folder" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/google-drive/test
 * Dispatches a tiny 1x1 test image to verify Google Drive folder creation and upload capability.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { refreshToken, email } = await getSiteWideGoogleDriveToken(supabase);
    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Drive is not connected yet. Please authorize first." },
        { status: 400 }
      );
    }

    const result = await testGoogleDriveUpload(refreshToken);

    return NextResponse.json({
      ...result,
      email,
      message: "Test image uploaded successfully to 'Mochex Trade Screenshots' folder!",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Google Drive upload test failed" },
      { status: 500 }
    );
  }
}
