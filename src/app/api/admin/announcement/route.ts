import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export interface AnnouncementData {
  id?: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "announcement";
  link_url?: string | null;
  link_text?: string | null;
  is_active: boolean;
  updated_at?: string;
}

// In-memory fallback if database table is not yet migrated
let memoryAnnouncement: AnnouncementData = {
  title: "Welcome to MOCHEX",
  message: "MEXC Futures Setup Journal & TradingView Webhook Engine active.",
  type: "info",
  link_url: "/watchlist",
  link_text: "View Watchlist",
  is_active: false,
};

export async function GET() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("system_announcements")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return NextResponse.json({ announcement: data });
    }
  } catch {
    // Table may not exist yet, use memory fallback
  }

  return NextResponse.json({
    announcement: memoryAnnouncement.is_active ? memoryAnnouncement : null,
  });
}

export async function POST(request: Request) {
  const { user, isAdmin, supabase } = await requireAdmin(false);

  if (!user || !isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body: AnnouncementData = await request.json();

    const payload = {
      title: body.title || "Announcement",
      message: body.message || "",
      type: body.type || "info",
      link_url: body.link_url || null,
      link_text: body.link_text || null,
      is_active: !!body.is_active,
      updated_at: new Date().toISOString(),
    };

    // Update in-memory fallback
    memoryAnnouncement = { ...payload };

    // Try saving to database table if present
    try {
      const { data: existing } = await supabase
        .from("system_announcements")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("system_announcements")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await supabase.from("system_announcements").insert([payload]);
      }
    } catch {
      // Ignore if table not yet created
    }

    return NextResponse.json({ ok: true, announcement: memoryAnnouncement });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
