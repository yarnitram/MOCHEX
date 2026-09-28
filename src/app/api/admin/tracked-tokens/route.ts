import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { isAdmin, user } = await requireAdmin(false);
  if (!isAdmin || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_tracked_tokens")
      .select("*")
      .eq("admin_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch tracked tokens" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { isAdmin, user } = await requireAdmin(false);
  if (!isAdmin || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { symbol, alert_enabled = true, min_usd_threshold = 10000 } = await request.json();

    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_tracked_tokens")
      .insert({
        admin_id: user.id,
        symbol: symbol.toUpperCase(),
        alert_enabled,
        min_usd_threshold,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: "Token is already being tracked" }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to track token" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const { isAdmin, user } = await requireAdmin(false);
  if (!isAdmin || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id, alert_enabled, min_usd_threshold } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: any = {};
    if (alert_enabled !== undefined) updates.alert_enabled = alert_enabled;
    if (min_usd_threshold !== undefined) updates.min_usd_threshold = min_usd_threshold;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_tracked_tokens")
      .update(updates)
      .eq("id", id)
      .eq("admin_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update token settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { isAdmin, user } = await requireAdmin(false);
  if (!isAdmin || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("admin_tracked_tokens")
      .delete()
      .eq("id", id)
      .eq("admin_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to untrack token" },
      { status: 500 }
    );
  }
}
