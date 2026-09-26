import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/archived-journal/[id]
 * Permanently delete an archived trade record.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // If local ID, it's only in browser cache, return ok directly
  if (id.startsWith("local-")) {
    return NextResponse.json({ ok: true, tableMissing: true });
  }

  const { error } = await supabase
    .from("archived_journal_trades")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      return NextResponse.json({ ok: true, tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
