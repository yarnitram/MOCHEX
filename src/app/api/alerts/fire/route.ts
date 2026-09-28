import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { NotificationType, TelegramDestination } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DBUserSettings {
  discord_webhook_url?: string | null;
  discord_webhooks?: string[] | null;
  notify_discord?: boolean;
  telegram_destinations?: TelegramDestination[] | null;
  notify_telegram?: boolean;
  notify_desktop?: boolean;
}

const numOrNull = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * POST /api/alerts/fire
 * Dispatch a triggered alert across configured channels:
 *   1. In-app notification (bell + /notifications page) — always
 *   2. Trade log to trade_alerts table (when token data accompanies alert)
 *   3. Discord webhooks (if notify_discord + discord_webhooks configured)
 *   4. Telegram bot messages (if notify_telegram + telegram_destinations configured)
 *   5. Desktop toast (if notify_desktop) — via local PowerShell
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const rawType = String(b.type ?? "system").trim();
  const validDbTypes: NotificationType[] = [
    "trade_alert",
    "risk_warning",
    "system",
    "watchlist_trigger",
  ];
  let type: NotificationType = "system";
  if (validDbTypes.includes(rawType as NotificationType)) {
    type = rawType as NotificationType;
  } else if (rawType === "tp1_hit" || rawType === "sl_tp_hit") {
    type = "trade_alert";
  } else {
    type = "system";
  }

  const title = String(b.title ?? "").trim();
  const message = String(b.message ?? "").trim();
  let link = b.link != null && String(b.link).trim() !== "" ? String(b.link).trim() : null;

  const symbol =
    b.symbol != null && String(b.symbol).trim() !== ""
      ? String(b.symbol).trim().toUpperCase()
      : null;

  // Prevent dead-end links: if a trigger fired and was given /watchlist (where it gets deleted),
  // link directly to /trades or /chart instead so the user sees the active trade plan
  if (link === "/watchlist" && symbol && (b.fired_price !== undefined || b.order_type !== undefined)) {
    link = `/trades`;
  }

  if (!title || !message) {
    return NextResponse.json({ error: "title and message required" }, { status: 400 });
  }

  // Load current user settings.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("discord_webhook_url, discord_webhooks, notify_discord, telegram_destinations, notify_telegram, notify_desktop")
    .eq("user_id", user.id)
    .maybeSingle();

  const s = (settings as DBUserSettings | null) ?? {
    discord_webhook_url: null,
    discord_webhooks: [],
    notify_discord: true,
    telegram_destinations: [],
    notify_telegram: true,
    notify_desktop: true,
  };

  const discordUrls: string[] = Array.isArray(s.discord_webhooks) && s.discord_webhooks.length > 0
    ? s.discord_webhooks
    : s.discord_webhook_url
    ? [s.discord_webhook_url]
    : [];

  const telegramDests: TelegramDestination[] = Array.isArray(s.telegram_destinations)
    ? s.telegram_destinations
    : [];

  const channels = {
    inApp: false,
    tradeLog: false,
    discord: false,
    telegram: false,
    desktop: false,
  };
  const errors: { discord?: string; telegram?: string; desktop?: string; tradeLog?: string } = {};

  // 1) In-app notification
  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: user.id,
    type,
    title,
    message,
    link,
    read: false,
  });
  if (!notifError) channels.inApp = true;

  // 2) Log to trade_alerts table if token data is included
  if (symbol) {
    const tradePayload: Record<string, unknown> = {
      user_id: user.id,
      symbol,
      trigger_price: numOrNull(b.trigger_price),
      trigger_direction:
        b.trigger_direction === "above" || b.trigger_direction === "below"
          ? b.trigger_direction
          : null,
      fired_price: numOrNull(b.fired_price),
      entry_price: numOrNull(b.entry_price),
      stop_loss: numOrNull(b.stop_loss),
      take_profit: numOrNull(b.take_profit),
      margin_usd: numOrNull(b.margin_usd),
      leverage: numOrNull(b.leverage),
      order_type:
        b.order_type === "limit" ||
        b.order_type === "trigger_limit" ||
        b.order_type === "market"
          ? b.order_type
          : null,
      notes:
        b.notes != null && String(b.notes).trim() !== ""
          ? String(b.notes).trim()
          : null,
      watchlist_item_id:
        b.watchlist_item_id != null && String(b.watchlist_item_id).trim() !== ""
          ? String(b.watchlist_item_id).trim()
          : null,
      fired_at: new Date().toISOString(),
      screenshot_urls: Array.isArray(b.screenshot_urls) ? b.screenshot_urls : [],
      screenshot_url: b.screenshot_url != null ? String(b.screenshot_url) : null,
    };

    let { error: tradeLogError } = await supabase.from("trade_alerts").insert(tradePayload);

    // Fallback: If foreign key error occurred (e.g. watchlist item was deleted before insert), retry with null watchlist_item_id
    if (tradeLogError && (tradeLogError.code === "23503" || tradeLogError.message?.includes("foreign key"))) {
      const retryRes = await supabase.from("trade_alerts").insert({
        ...tradePayload,
        watchlist_item_id: null,
      });
      tradeLogError = retryRes.error;
    }

    if (!tradeLogError) channels.tradeLog = true;
    else errors.tradeLog = tradeLogError.message;
  }

  // 3) Discord webhooks (multi-channel fan out)
  if (s.notify_discord !== false && discordUrls.length > 0) {
    const results = await Promise.all(
      discordUrls.map((url) => sendDiscord(url, title, message, link))
    );
    const anySuccess = results.some((r) => r.ok);
    channels.discord = anySuccess;
    if (!anySuccess) {
      errors.discord = `All ${discordUrls.length} Discord webhooks failed.`;
    }
  } else if (s.notify_discord === false) {
    errors.discord = "notify_discord disabled";
  } else if (discordUrls.length === 0) {
    errors.discord = "no Discord webhooks configured";
  }

  // 4) Telegram notifications (multi-destination fan out)
  if (s.notify_telegram !== false && telegramDests.length > 0) {
    const results = await Promise.all(
      telegramDests.map((dest) => sendTelegram(dest.bot_token, dest.chat_id, title, message, link))
    );
    const anySuccess = results.some((r) => r.ok);
    channels.telegram = anySuccess;
    if (!anySuccess) {
      errors.telegram = `All ${telegramDests.length} Telegram destinations failed.`;
    }
  } else if (s.notify_telegram === false) {
    errors.telegram = "notify_telegram disabled";
  } else if (telegramDests.length === 0) {
    errors.telegram = "no Telegram destinations configured";
  }

  // 5) Desktop toast
  if (s.notify_desktop !== false) {
    channels.desktop = await sendDesktop(title, message);
    if (!channels.desktop) errors.desktop = "powershell toast failed";
  }

  return NextResponse.json({ ok: true, channels, errors: Object.keys(errors).length > 0 ? errors : undefined });
}

/** POST to a Discord webhook URL. */
async function sendDiscord(
  webhookUrl: string,
  title: string,
  message: string,
  link: string | null
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const linkPart = link && /^https?:\/\//i.test(link) ? `\n**View in app:** ${link}` : "";
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "MOCHEX",
        content: `🔔 **${title}**\n${message}${linkPart}`,
      }),
    });
    return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

/** POST to Telegram Bot API. */
async function sendTelegram(
  botToken: string,
  chatId: string,
  title: string,
  message: string,
  link: string | null
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const linkPart = link && /^https?:\/\//i.test(link) ? `\n\n<a href="${link}">View in app</a>` : "";
    const text = `🔔 <b>${escapeHtml(title)}</b>\n${escapeHtml(message)}${linkPart}`;
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Fire a Windows desktop toast via PowerShell. */
async function sendDesktop(title: string, body: string): Promise<boolean> {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$n=New-Object System.Windows.Forms.NotifyIcon;",
    "$n.Icon=[System.Drawing.SystemIcons]::Information;",
    `$n.BalloonTipTitle=[char]34+${JSON.stringify(title)}+[char]34;`,
    `$n.BalloonTipText=[char]34+${JSON.stringify(body)}+[char]34;`,
    "$n.Visible=$true;",
    "$n.ShowBalloonTip(8000);",
    "Start-Sleep -Milliseconds 200;",
    "$n.Dispose();",
  ].join(" ");

  return new Promise<boolean>((resolve) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", ps], {
      windowsHide: true,
    });
    child.on("close", (code: number | null) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}