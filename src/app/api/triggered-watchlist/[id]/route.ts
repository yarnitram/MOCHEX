import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/triggered-watchlist/[id] — remove a triggered item archive row. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase
    .from("triggered_watchlist_items")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      return NextResponse.json({ ok: true, tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
