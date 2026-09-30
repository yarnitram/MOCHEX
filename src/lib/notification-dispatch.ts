import { spawn } from "node:child_process";
import { createClient } from "@/lib/supabase/server";
import type { NotificationType, TelegramDestination } from "@/lib/types";

export interface DBUserSettings {
  discord_webhook_url?: string | null;
  discord_webhooks?: string[] | null;
  notify_discord?: boolean;
  telegram_destinations?: TelegramDestination[] | null;
  notify_telegram?: boolean;
  notify_desktop?: boolean;
}

export interface DispatchNotificationOptions {
  type?: NotificationType | "tp1_hit" | "sl_tp_hit" | string;
  title: string;
  message: string;
  link?: string | null;
}

export interface DispatchNotificationResult {
  inApp: boolean;
  discord: boolean;
  telegram: boolean;
  desktop: boolean;
  errors?: Record<string, string>;
}

/**
 * Dispatch an alert notification across in-app and external user channels (Discord, Telegram, Desktop).
 * Avoids any server self-loopback HTTP calls.
 */
export async function dispatchAlertNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  opts: DispatchNotificationOptions
): Promise<DispatchNotificationResult> {
  const rawType = String(opts.type ?? "system").trim();
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

  const title = String(opts.title ?? "").trim();
  const message = String(opts.message ?? "").trim();
  const link = opts.link != null && String(opts.link).trim() !== "" ? String(opts.link).trim() : null;

  const result: DispatchNotificationResult = {
    inApp: false,
    discord: false,
    telegram: false,
    desktop: false,
  };
  const errors: Record<string, string> = {};

  if (!title || !message) {
    return result;
  }

  // 1. In-app notification (bell + /notifications page)
  const { error: notifError } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    link,
    read: false,
  });
  if (!notifError) {
    result.inApp = true;
  } else {
    errors.inApp = notifError.message;
  }

  // 2. Fetch user settings for external channels
  const { data: settings } = await supabase
    .from("user_settings")
    .select(
      "discord_webhook_url, discord_webhooks, notify_discord, telegram_destinations, notify_telegram, notify_desktop"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const s = (settings as DBUserSettings | null) ?? {
    discord_webhook_url: null,
    discord_webhooks: [],
    notify_discord: true,
    telegram_destinations: [],
    notify_telegram: true,
    notify_desktop: true,
  };

  const discordUrls: string[] =
    Array.isArray(s.discord_webhooks) && s.discord_webhooks.length > 0
      ? s.discord_webhooks
      : s.discord_webhook_url
      ? [s.discord_webhook_url]
      : [];

  const telegramDests: TelegramDestination[] = Array.isArray(s.telegram_destinations)
    ? s.telegram_destinations
    : [];

  // 3. Discord webhooks fan-out
  if (s.notify_discord !== false && discordUrls.length > 0) {
    try {
      const res = await Promise.all(
        discordUrls.map((url) => sendDiscord(url, title, message, link))
      );
      result.discord = res.some((r) => r.ok);
      if (!result.discord) {
        errors.discord = `All ${discordUrls.length} Discord webhooks failed.`;
      }
    } catch (err) {
      errors.discord = (err as Error).message;
    }
  }

  // 4. Telegram fan-out
  if (s.notify_telegram !== false && telegramDests.length > 0) {
    try {
      const res = await Promise.all(
        telegramDests.map((dest) =>
          sendTelegram(dest.bot_token, dest.chat_id, title, message, link)
        )
      );
      result.telegram = res.some((r) => r.ok);
      if (!result.telegram) {
        errors.telegram = `All ${telegramDests.length} Telegram destinations failed.`;
      }
    } catch (err) {
      errors.telegram = (err as Error).message;
    }
  }

  // 5. Desktop toast (Windows via PowerShell)
  if (s.notify_desktop !== false && process.platform === "win32") {
    try {
      result.desktop = await sendDesktop(title, message);
      if (!result.desktop) {
        errors.desktop = "powershell toast failed";
      }
    } catch (err) {
      errors.desktop = (err as Error).message;
    }
  }

  if (Object.keys(errors).length > 0) {
    result.errors = errors;
  }
  return result;
}

export async function sendDiscord(
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
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function sendTelegram(
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
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendDesktop(title: string, body: string): Promise<boolean> {
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
