import { NextResponse } from "next/server";
import { requireAdmin, getAdminList } from "@/lib/admin";

export async function GET() {
  const { user, isAdmin, supabase } = await requireAdmin(false);

  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    // 1. Fetch user profiles
    const { data: users, error: usersErr } = await supabase
      .from("user_settings")
      .select("user_id, username, display_name, updated_at, google_drive_connected, is_admin")
      .order("updated_at", { ascending: false });

    if (usersErr) throw usersErr;

    // 2. Fetch trade counts per user
    const { data: trades } = await supabase.from("trades").select("user_id");
    const tradeCountMap: Record<string, number> = {};
    trades?.forEach((t) => {
      tradeCountMap[t.user_id] = (tradeCountMap[t.user_id] || 0) + 1;
    });

    // 3. Fetch watchlist counts per user
    const { data: watchlists } = await supabase.from("watchlist").select("user_id");
    const watchlistCountMap: Record<string, number> = {};
    watchlists?.forEach((w) => {
      watchlistCountMap[w.user_id] = (watchlistCountMap[w.user_id] || 0) + 1;
    });

    const { usernames } = getAdminList();

    const enrichedUsers = (users || []).map((u) => {
      const isUserAdminRole =
        u.is_admin === true || (u.username && usernames.includes(u.username.toLowerCase()));

      return {
        id: u.user_id,
        username: u.username || "Anonymous",
        displayName: u.display_name || u.username || "Trader",
        updatedAt: u.updated_at,
        isAdmin: !!isUserAdminRole,
        tradesCount: tradeCountMap[u.user_id] || 0,
        watchlistCount: watchlistCountMap[u.user_id] || 0,
        googleDriveConnected: !!u.google_drive_connected,
      };
    });

    return NextResponse.json({ users: enrichedUsers });
  } catch (err) {
    console.error("Failed to load admin users:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user, isAdmin, supabase } = await requireAdmin(false);

  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { targetUserId, setAdmin } = body;

    if (!targetUserId || typeof setAdmin !== "boolean") {
      return NextResponse.json({ error: "targetUserId and setAdmin boolean required" }, { status: 400 });
    }

    // Update in user_settings
    const { error: updateErr } = await supabase
      .from("user_settings")
      .update({ is_admin: setAdmin })
      .eq("user_id", targetUserId);

    if (updateErr) {
      // If column is_admin doesn't exist yet in DB schema cache, inform user
      return NextResponse.json(
        { error: "Could not update is_admin in database: " + updateErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, targetUserId, isAdmin: setAdmin });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
