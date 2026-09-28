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
      .from("admin_tracked_wallets")
      .select("*")
      .eq("admin_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch tracked wallets" },
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
    const { wallet_address, label, notes, alert_enabled = true, min_usd_threshold = 5000 } = await request.json();

    if (!wallet_address) {
      return NextResponse.json({ error: "wallet_address is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("admin_tracked_wallets")
      .insert({
        admin_id: user.id,
        wallet_address,
        label,
        notes,
        alert_enabled,
        min_usd_threshold,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: "Wallet is already being tracked" }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to track wallet" },
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
      .from("admin_tracked_wallets")
      .update(updates)
      .eq("id", id)
      .eq("admin_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update wallet settings" },
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
      .from("admin_tracked_wallets")
      .delete()
      .eq("id", id)
      .eq("admin_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to untrack wallet" },
      { status: 500 }
    );
  }
}

