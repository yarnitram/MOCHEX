import { createClient } from "@/lib/supabase/server";
import { getAccounts, getRiskSettings } from "@/lib/data";
import { SettingsForm } from "@/components/settings/settings-form";
import { isUserAdmin } from "@/lib/admin";
import type { TelegramDestination } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-sm">Sign in to manage settings.</p>;
  }

  // Notification settings.
  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const d = (data as {
    username?: string | null;
    display_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    twitter_handle?: string | null;
    telegram_channel?: string | null;
    is_profile_public?: boolean | null;
    discord_webhook_url?: string | null;
    discord_webhooks?: string[] | null;
    notify_discord?: boolean;
    telegram_destinations?: TelegramDestination[] | null;
    notify_telegram?: boolean;
    notify_desktop?: boolean;
    refresh_interval_sec?: number | null;
    webhook_secret?: string | null;
    google_drive_connected?: boolean | null;
    google_drive_email?: string | null;
    screenshot_storage_backend?: "supabase" | "google_drive" | "auto" | null;
    is_admin?: boolean | null;
  } | null);

  const isAdmin = isUserAdmin(user, d);

  let webhookSecret = d?.webhook_secret;
  if (!webhookSecret) {
    webhookSecret = `tv_sec_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, webhook_secret: webhookSecret }, { onConflict: "user_id" });
  }

  const discordWebhooks = Array.isArray(d?.discord_webhooks) && d.discord_webhooks.length > 0
    ? d.discord_webhooks
    : d?.discord_webhook_url
    ? [d.discord_webhook_url]
    : [];

  const telegramDestinations = Array.isArray(d?.telegram_destinations)
    ? d.telegram_destinations
    : [];

  // Risk settings
  const accounts = await getAccounts(supabase, user);
  const activeAccount = accounts[0] ?? null;
  const riskSettings = activeAccount
    ? await getRiskSettings(supabase, activeAccount.id)
    : null;

  return (
    <div className="w-full">
      <SettingsForm
        userEmail={user.email ?? ""}
        isAdmin={isAdmin}
        account={activeAccount}
        riskSettings={riskSettings}
        initial={{
          username: d?.username ?? "",
          display_name: d?.display_name ?? null,
          bio: d?.bio ?? null,
          avatar_url: d?.avatar_url ?? null,
          twitter_handle: d?.twitter_handle ?? null,
          telegram_channel: d?.telegram_channel ?? null,
          is_profile_public: d?.is_profile_public !== false,
          discord_webhooks: discordWebhooks,
          notify_discord: d?.notify_discord ?? true,
          telegram_destinations: telegramDestinations,
          notify_telegram: d?.notify_telegram ?? true,
          notify_desktop: d?.notify_desktop ?? true,
          refresh_interval_sec: d?.refresh_interval_sec ?? 10,
          webhook_secret: webhookSecret,
          google_drive_connected: d?.google_drive_connected ?? false,
          google_drive_email: d?.google_drive_email ?? null,
          screenshot_storage_backend: d?.screenshot_storage_backend ?? "auto",
        }}
      />
    </div>
  );
}