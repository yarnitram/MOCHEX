import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUserAdmin } from "@/lib/admin";

/** GET /api/settings — return the current user's notification settings. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return stored settings or sensible defaults.
  const discordWebhooks: string[] = Array.isArray(data?.discord_webhooks)
    ? data.discord_webhooks
    : data?.discord_webhook_url
    ? [data.discord_webhook_url]
    : [];

  const telegramDestinations = Array.isArray(data?.telegram_destinations)
    ? data.telegram_destinations
    : [];

  let webhookSecret = data?.webhook_secret;
  if (!webhookSecret) {
    webhookSecret = `tv_sec_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, webhook_secret: webhookSecret }, { onConflict: "user_id" });
  }

  return NextResponse.json({
    settings: {
      user_id: user.id,
      username: data?.username ?? null,
      display_name: data?.display_name ?? null,
      bio: data?.bio ?? null,
      avatar_url: data?.avatar_url ?? null,
      twitter_handle: data?.twitter_handle ?? null,
      telegram_channel: data?.telegram_channel ?? null,
      is_profile_public: data?.is_profile_public ?? true,
      discord_webhook_url: data?.discord_webhook_url ?? null,
      discord_webhooks: discordWebhooks,
      notify_discord: data?.notify_discord ?? true,
      telegram_destinations: telegramDestinations,
      notify_telegram: data?.notify_telegram ?? true,
      notify_desktop: data?.notify_desktop ?? true,
      refresh_interval_sec: data?.refresh_interval_sec ?? 10,
      sound_enabled: data?.sound_enabled ?? true,
      proximity_alarm_enabled: data?.proximity_alarm_enabled ?? true,
      proximity_threshold_pct: Number(data?.proximity_threshold_pct ?? 0.5),
      alarm_sound_preset: data?.alarm_sound_preset ?? "radar_ping",
      webhook_secret: webhookSecret,
      is_admin: isUserAdmin(user, data),
    },
  });
}

/** PUT /api/settings — upsert notification settings. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // Process username handle
  let username: string | null = null;
  if (typeof b.username === "string" && b.username.trim().length > 0) {
    username = b.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (username.length < 3 || username.length > 20) {
      return NextResponse.json(
        { error: "Username must be between 3 and 20 characters (alphanumeric, underscores, hyphens)." },
        { status: 400 }
      );
    }
    // Check reserved names
    const reserved = [
      "watchlist", "trades", "journal", "settings", "analytics", "risk",
      "notifications", "shares", "login", "auth", "api", "public", "share"
    ];
    if (reserved.includes(username)) {
      return NextResponse.json(
        { error: `The username "${username}" is reserved. Please choose another.` },
        { status: 400 }
      );
    }

    // Check availability
    const { data: existing } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("username", username)
      .neq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Username "${username}" is already taken by another trader.` },
        { status: 400 }
      );
    }
  }

  // Process profile fields
  const displayName = typeof b.display_name === "string" ? b.display_name.trim() || null : null;
  const bio = typeof b.bio === "string" ? b.bio.trim() || null : null;
  const twitterHandle = typeof b.twitter_handle === "string" ? b.twitter_handle.trim().replace(/^@/, "") || null : null;
  const telegramChannel = typeof b.telegram_channel === "string" ? b.telegram_channel.trim() || null : null;
  const isProfilePublic = b.is_profile_public !== false;

  // Process discord_webhooks array
  const rawWebhooks = Array.isArray(b.discord_webhooks)
    ? b.discord_webhooks.map((x) => String(x).trim()).filter(Boolean)
    : b.discord_webhook_url
    ? [String(b.discord_webhook_url).trim()]
    : [];

  for (const w of rawWebhooks) {
    if (!w.startsWith("https://discord.com/api/webhooks/")) {
      return NextResponse.json(
        { error: `Invalid Discord webhook URL: ${w}. Must start with https://discord.com/api/webhooks/` },
        { status: 400 }
      );
    }
  }

  // Process telegram_destinations array
  const rawTelegram = Array.isArray(b.telegram_destinations)
    ? b.telegram_destinations.map((t: Record<string, unknown>) => ({
        id: String(t.id || genId()),
        bot_token: String(t.bot_token || "").trim(),
        chat_id: String(t.chat_id || "").trim(),
        label: t.label ? String(t.label).trim() : undefined,
      })).filter((t) => t.bot_token && t.chat_id)
    : [];

  // Normalize the watchlist refresh interval (seconds), clamped to [3, 3600].
  const rawInterval = Number(b.refresh_interval_sec);
  const refreshInterval = Number.isFinite(rawInterval)
    ? Math.min(3600, Math.max(3, Math.round(rawInterval)))
    : 10;

  // Normalize audio proximity settings
  const proximityThreshold = Number(b.proximity_threshold_pct) || 0.5;
  const alarmPreset = typeof b.alarm_sound_preset === "string" ? b.alarm_sound_preset : "radar_ping";

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      username: username,
      display_name: displayName,
      bio: bio,
      twitter_handle: twitterHandle,
      telegram_channel: telegramChannel,
      is_profile_public: isProfilePublic,
      discord_webhook_url: rawWebhooks[0] || null,
      discord_webhooks: rawWebhooks,
      notify_discord: b.notify_discord !== false,
      telegram_destinations: rawTelegram,
      notify_telegram: b.notify_telegram !== false,
      notify_desktop: b.notify_desktop !== false,
      refresh_interval_sec: refreshInterval,
      sound_enabled: b.sound_enabled !== false,
      proximity_alarm_enabled: b.proximity_alarm_enabled !== false,
      proximity_threshold_pct: proximityThreshold,
      alarm_sound_preset: alarmPreset,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

function genId() {
  return Math.random().toString(36).substring(2, 9);
}