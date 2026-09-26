import { createClient } from "@/lib/supabase/server";
import { WatchlistClient } from "@/components/watchlist/watchlist-client";
import type {
  TriggeredWatchlistItem,
  WatchlistItem,
  ArchivedWatchlistItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: WatchlistItem[] = [];
  let triggered: TriggeredWatchlistItem[] = [];
  let archived: ArchivedWatchlistItem[] = [];

  let isTriggeredTableMissing = false;

  if (user) {
    const [{ data: itemsData }, trigResult, { data: archivedData }] =
      await Promise.all([
        supabase
          .from("watchlist_items")
          .select("*")
          .order("added_at", { ascending: true }),
        supabase
          .from("triggered_watchlist_items")
          .select("*")
          .order("fired_at", { ascending: false }),
        supabase
          .from("archived_watchlist_items")
          .select("*")
          .order("archived_at", { ascending: false }),
      ]);
    items = (itemsData ?? []) as WatchlistItem[];
    triggered = (trigResult.data ?? []) as TriggeredWatchlistItem[];
    archived = (archivedData ?? []) as ArchivedWatchlistItem[];
    if (
      trigResult.error?.code === "PGRST205" ||
      trigResult.error?.message?.includes("schema cache")
    ) {
      isTriggeredTableMissing = true;
    }
  }

  // Read the user's preferred refresh interval (seconds) so the client can
  // poll the MEXC API at the configured cadence.
  let refreshIntervalSec = 10;
  if (user) {
    const { data: settings } = await supabase
      .from("user_settings")
      .select("refresh_interval_sec")
      .eq("user_id", user.id)
      .maybeSingle();
    const n = Number(
      (settings as { refresh_interval_sec?: number | null } | null)
        ?.refresh_interval_sec ?? 10
    );
    if (Number.isFinite(n) && n >= 3) refreshIntervalSec = n;
  }

  return (
    <WatchlistClient
      initialItems={items}
      initialTriggeredItems={triggered}
      initialArchivedItems={archived}
      initialTriggeredTableMissing={isTriggeredTableMissing}
      refreshIntervalSec={refreshIntervalSec}
    />
  );
}