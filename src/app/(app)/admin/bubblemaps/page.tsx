import { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { BubbleMapsView } from "@/components/admin/bubble-maps-view";

export const metadata: Metadata = {
  title: "BubbleMaps & Whale Tracker | Admin MOCHEX",
  description: "On-chain token holder clustering and DEX whale buy/sell tracking for emerging crypto tokens.",
};

export default async function AdminBubbleMapsPage() {
  const { user } = await requireAdmin(true);

  if (!user) {
    return null;
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      <Suspense fallback={<div className="p-8 text-center text-xs font-mono text-muted">Loading BubbleMaps...</div>}>
        <BubbleMapsView />
      </Suspense>
    </div>
  );
}
