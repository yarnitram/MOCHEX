import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { BroadcastBanner } from "@/components/ui/broadcast-banner";
import { AudioAlarmNotifier } from "@/components/notifications/audio-alarm-notifier";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already guards these routes; this is a defence-in-depth check.
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col flex-1 w-full">
      <BroadcastBanner />
      <AppNav />
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 flex-1">
        {children}
      </main>
      <AudioAlarmNotifier />
      <footer className="hairline-t py-6 text-center text-xs text-muted">
        <span className="brand">MOCHEX</span> — crypto trading setup journal
      </footer>
    </div>
  );
}