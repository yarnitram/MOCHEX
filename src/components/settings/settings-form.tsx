"use client";

import { useState, useEffect, useMemo } from "react";
import type { TelegramDestination } from "@/lib/types";
import {
  isAudioEnabled,
  setAudioEnabled as saveAudioEnabled,
  getAudioVolume,
  setAudioVolume as saveAudioVolume,
  playTriggerSound,
  playTpSound,
  playSlSound,
} from "@/lib/audio";
import { playAlarmSound, AlarmSoundPreset } from "@/lib/audio-alarm-engine";
import { TipModal } from "@/components/ui/tip-modal";

interface Props {
  userEmail: string;
  initial: {
    username?: string;
    display_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    twitter_handle?: string | null;
    telegram_channel?: string | null;
    is_profile_public?: boolean | null;
    discord_webhooks: string[];
    notify_discord: boolean;
    telegram_destinations: TelegramDestination[];
    notify_telegram: boolean;
    notify_desktop: boolean;
    refresh_interval_sec: number;
    sound_enabled?: boolean;
    proximity_alarm_enabled?: boolean;
    proximity_threshold_pct?: number;
    alarm_sound_preset?: string;
    webhook_secret?: string;
    google_drive_connected?: boolean;
    google_drive_email?: string | null;
    screenshot_storage_backend?: "supabase" | "google_drive" | "auto";
  };
}

export function SettingsForm({ userEmail, initial }: Props) {
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [username, setUsername] = useState(initial.username || "");
  const [displayName, setDisplayName] = useState(initial.display_name || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [twitterHandle, setTwitterHandle] = useState(initial.twitter_handle || "");
  const [telegramChannel, setTelegramChannel] = useState(initial.telegram_channel || "");
  const [isProfilePublic, setIsProfilePublic] = useState(initial.is_profile_public !== false);

  const [discordWebhooks, setDiscordWebhooks] = useState<string[]>(
    initial.discord_webhooks.length > 0 ? initial.discord_webhooks : [""]
  );
  const [notifyDiscord, setNotifyDiscord] = useState(initial.notify_discord);

  const [telegramDests, setTelegramDests] = useState<TelegramDestination[]>(
    initial.telegram_destinations.length > 0
      ? initial.telegram_destinations
      : [{ id: genId(), bot_token: "", chat_id: "", label: "" }]
  );
  const [notifyTelegram, setNotifyTelegram] = useState(initial.notify_telegram);

  const [notifyDesktop, setNotifyDesktop] = useState(initial.notify_desktop);
  const [refreshInterval, setRefreshInterval] = useState(
    String(initial.refresh_interval_sec)
  );

  // ---- Audio Alarm Proximity State ----
  const [proximityEnabled, setProximityEnabled] = useState(
    initial.proximity_alarm_enabled !== false
  );
  const [proximityThreshold, setProximityThreshold] = useState(
    String(initial.proximity_threshold_pct ?? 0.5)
  );
  const [alarmPreset, setAlarmPreset] = useState<AlarmSoundPreset>(
    (initial.alarm_sound_preset as AlarmSoundPreset) || "radar_ping"
  );

  // ---- Audio Sound FX State ----
  const [audioEnabled, setAudioStateEnabled] = useState(true);
  const [audioVolume, setAudioStateVolume] = useState(0.5);

  // ---- Google Drive Screenshot Storage State ----
  const [gdriveConnected, setGdriveConnected] = useState(initial.google_drive_connected ?? false);
  const [gdriveEmail, setGdriveEmail] = useState(initial.google_drive_email ?? null);
  const [disconnectingGdrive, setDisconnectingGdrive] = useState(false);

  useEffect(() => {
    setAudioStateEnabled(isAudioEnabled());
    setAudioStateVolume(getAudioVolume());

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gdrive") === "connected") {
        setStatus("Google Drive connected successfully! All new screenshots will save directly to your Drive ✓");
        setGdriveConnected(true);
      }
      if (params.get("error")) {
        setError(params.get("error"));
      }
    }
  }, []);

  async function handleDisconnectGdrive() {
    if (!window.confirm("Disconnect your Google Drive account? New screenshots will save to Supabase storage.")) {
      return;
    }
    setDisconnectingGdrive(true);
    try {
      const res = await fetch("/api/auth/google-drive/disconnect", { method: "POST" });
      if (res.ok) {
        setGdriveConnected(false);
        setGdriveEmail(null);
        setStatus("Google Drive disconnected successfully ✓");
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to disconnect Google Drive");
      }
    } catch {
      setError("Failed to disconnect Google Drive");
    } finally {
      setDisconnectingGdrive(false);
    }
  }

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // ---- TradingView Webhook State ----
  const [webhookSecret, setWebhookSecret] = useState(initial.webhook_secret || "");
  const [showSecret, setShowSecret] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);

  // TradingView Generator state
  const [genType, setGenType] = useState<"watchlist" | "trade">("watchlist");
  const [genSymbol, setGenSymbol] = useState("{{ticker}}");
  const [genSide, setGenSide] = useState<"long" | "short">("long");
  const [genOrderType, setGenOrderType] = useState<"limit" | "market">("limit");
  const [genTrigger, setGenTrigger] = useState("{{close}}");
  const [genEntry, setGenEntry] = useState("{{close}}");
  const [genStopLoss, setGenStopLoss] = useState("62500");
  const [genTakeProfit, setGenTakeProfit] = useState("68000");
  const [genNotes, setGenNotes] = useState("4H EMA 200 Rebound");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://mochex.app";
  const webhookUrl = `${origin}/api/webhooks/tradingview?key=${webhookSecret}`;

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  }

  async function handleRegenerateSecret() {
    if (!window.confirm("Regenerate your TradingView webhook secret? Any TradingView alerts using your old secret will stop working.")) {
      return;
    }
    setRegeneratingSecret(true);
    try {
      const res = await fetch("/api/settings/webhook-secret", { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate secret");
      const d = await res.json();
      setWebhookSecret(d.webhook_secret);
      setStatus("TradingView webhook secret regenerated successfully ✓");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegeneratingSecret(false);
    }
  }

  const generatedJsonString = useMemo(() => {
    if (genType === "watchlist") {
      const obj = {
        symbol: genSymbol,
        position: genSide,
        order_type: genOrderType,
        trigger_price: genTrigger,
        entry_price: genEntry,
        stop_loss: Number(genStopLoss) || 62500,
        take_profit: Number(genTakeProfit) || 68000,
        notes: genNotes,
      };
      return JSON.stringify(obj, null, 2);
    } else {
      const obj = {
        action: "trade",
        symbol: genSymbol,
        side: genSide,
        order_type: genOrderType,
        entry_price: genEntry,
        stop_loss: Number(genStopLoss) || 62500,
        take_profit: Number(genTakeProfit) || 68000,
        leverage: 10,
        margin_usd: 100,
        notes: genNotes,
      };
      return JSON.stringify(obj, null, 2);
    }
  }, [genType, genSymbol, genSide, genOrderType, genTrigger, genEntry, genStopLoss, genTakeProfit, genNotes]);

  function copyGeneratedPayload() {
    navigator.clipboard.writeText(generatedJsonString);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  }

  async function handleSendTestWebhook() {
    setTestingWebhook(true);
    setTestWebhookStatus(null);
    try {
      const testPayload = genType === "watchlist" ? {
        symbol: "BTC_USDT",
        position: genSide,
        order_type: genOrderType,
        trigger_price: 64200,
        entry_price: 64000,
        stop_loss: 62500,
        take_profit: 68000,
        notes: "Test Alert triggered from MOCHEX Settings",
      } : {
        action: "trade",
        symbol: "BTC_USDT",
        side: genSide,
        order_type: genOrderType,
        entry_price: 64000,
        stop_loss: 62500,
        take_profit: 68000,
        leverage: 10,
        margin_usd: 50,
        notes: "Test Trade Execution from MOCHEX Settings",
      };

      const res = await fetch(`/api/webhooks/tradingview?key=${webhookSecret}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Webhook test failed");
      }

      const resJson = await res.json();
      setTestWebhookStatus(`✓ Test ${resJson.action} alert received! Added ${resJson.symbol} to your ${resJson.action === "trade" ? "Trades" : "Watchlist"}.`);
    } catch (err) {
      setTestWebhookStatus(`✕ Test error: ${(err as Error).message}`);
    } finally {
      setTestingWebhook(false);
    }
  }

  const inputCls =
    "hairline bg-panel px-3 py-2 text-sm outline-none focus:border-accent w-full rounded";

  // ---- Discord Webhook Handlers ----

  function handleAddDiscord() {
    setDiscordWebhooks([...discordWebhooks, ""]);
  }

  function handleRemoveDiscord(index: number) {
    setDiscordWebhooks(discordWebhooks.filter((_, i) => i !== index));
  }

  function handleDiscordChange(index: number, value: string) {
    const next = [...discordWebhooks];
    next[index] = value;
    setDiscordWebhooks(next);
  }

  async function handleTestDiscord(url: string, index: number) {
    if (!url.trim()) {
      setError("Enter a Discord webhook URL first.");
      return;
    }
    setTestingId(`discord-${index}`);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discord_webhook_url: url }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Test failed");
      }
      setStatus(`Test notification sent to Discord Webhook #${index + 1} ✓`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  // ---- Telegram Destination Handlers ----

  function handleAddTelegram() {
    setTelegramDests([
      ...telegramDests,
      { id: genId(), bot_token: "", chat_id: "", label: "" },
    ]);
  }

  function handleRemoveTelegram(id: string) {
    setTelegramDests(telegramDests.filter((t) => t.id !== id));
  }

  function handleTelegramChange(
    id: string,
    field: keyof TelegramDestination,
    value: string
  ) {
    setTelegramDests(
      telegramDests.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  }

  async function handleTestTelegram(dest: TelegramDestination) {
    if (!dest.bot_token.trim() || !dest.chat_id.trim()) {
      setError("Provide both Bot Token and Chat ID before testing.");
      return;
    }
    setTestingId(`telegram-${dest.id}`);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: dest.bot_token,
          chat_id: dest.chat_id,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Telegram test failed");
      }
      setStatus(
        `Test notification sent to Telegram (${dest.label || "Bot"}) ✓`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  // ---- Desktop Test Handler ----

  async function handleTestDesktop() {
    setTestingId("desktop");
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/test-desktop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Test failed");
      }
      setStatus("Desktop notification sent ✓ Check your Windows toast alerts.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  // ---- Form Submission ----

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);

    const filteredWebhooks = discordWebhooks
      .map((w) => w.trim())
      .filter(Boolean);

    const filteredTelegram = telegramDests
      .map((t) => ({
        ...t,
        bot_token: t.bot_token.trim(),
        chat_id: t.chat_id.trim(),
        label: t.label?.trim() || undefined,
      }))
      .filter((t) => t.bot_token && t.chat_id);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim() || null,
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          twitter_handle: twitterHandle.trim() || null,
          telegram_channel: telegramChannel.trim() || null,
          is_profile_public: isProfilePublic,
          discord_webhooks: filteredWebhooks,
          notify_discord: notifyDiscord,
          telegram_destinations: filteredTelegram,
          notify_telegram: notifyTelegram,
          notify_desktop: notifyDesktop,
          refresh_interval_sec: Number(refreshInterval) || 10,
          sound_enabled: audioEnabled,
          proximity_alarm_enabled: proximityEnabled,
          proximity_threshold_pct: Number(proximityThreshold) || 0.5,
          alarm_sound_preset: alarmPreset,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save settings");
      }

      setStatus("Settings saved successfully ✓");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div>
        <p className="eyebrow mb-1">Preferences</p>
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-muted">Signed in as {userEmail}</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* ---- Public Trader Profile & Handle ---- */}
        <fieldset className="hairline p-5 flex flex-col gap-4 rounded-lg bg-panel/40">
          <legend className="px-1 text-sm font-semibold flex items-center gap-2">
            <span>👤 Public Trader Profile & Branding</span>
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-medium text-text flex flex-col gap-1">
              Display Name
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam Trading or Crypto Setup Pro"
                className={inputCls}
                maxLength={40}
              />
            </label>

            <label className="text-xs font-medium text-text flex flex-col gap-1">
              Username / Handle (Vanity URL)
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-mono select-none">/</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="e.g. samsam"
                  className={`${inputCls} font-mono`}
                  maxLength={20}
                />
              </div>
            </label>
          </div>

          <label className="text-xs font-medium text-text flex flex-col gap-1">
            Trader Bio & Market Outlook
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Solana & BTC momentum setup trader. Sharing high-probability breakouts."
              className={`${inputCls} resize-none`}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-medium text-text flex flex-col gap-1">
              Twitter / X Handle
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted font-mono select-none">@</span>
                <input
                  type="text"
                  value={twitterHandle}
                  onChange={(e) => setTwitterHandle(e.target.value)}
                  placeholder="e.g. sam_crypto"
                  className={inputCls}
                />
              </div>
            </label>

            <label className="text-xs font-medium text-text flex flex-col gap-1">
              Telegram Channel URL / Username
              <input
                type="text"
                value={telegramChannel}
                onChange={(e) => setTelegramChannel(e.target.value)}
                placeholder="e.g. https://t.me/sam_setups or sam_setups"
                className={inputCls}
              />
            </label>
          </div>

          <label className="flex items-center justify-between p-3 rounded bg-panel border border-hairline cursor-pointer">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-xs text-text">Enable Public Trader Showcase Page</span>
              <span className="text-[11px] text-muted">
                {isProfilePublic
                  ? `Your profile landing page will be public at /${username || "handle"}`
                  : "Your profile landing page will be hidden."}
              </span>
            </div>
            <input
              type="checkbox"
              checked={isProfilePublic}
              onChange={(e) => setIsProfilePublic(e.target.checked)}
              className="accent-accent h-4 w-4 cursor-pointer"
            />
          </label>

          {username && (
            <div className="p-3 rounded bg-panel/80 border border-hairline flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted">Public Profile Showcase URL:</span>
                <span className="font-mono text-accent text-xs font-bold">
                  /{username}
                </span>
              </div>
              <a
                href={`/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>👁 View Profile Page</span>
              </a>
            </div>
          )}
        </fieldset>

        {/* ---- Discord Webhooks Section ---- */}
        <fieldset className="hairline p-5 flex flex-col gap-4 rounded-lg bg-panel/40">
          <legend className="px-1 text-sm font-semibold flex items-center gap-2">
            <span>Discord Webhooks</span>
          </legend>

          <label className="flex items-center justify-between gap-3 cursor-pointer hairline-b pb-3">
            <span className="text-sm font-medium">
              Enable Discord Notifications
            </span>
            <input
              type="checkbox"
              checked={notifyDiscord}
              onChange={(e) => setNotifyDiscord(e.target.checked)}
              className="accent-accent h-4 w-4 cursor-pointer"
            />
          </label>

          <div className="flex flex-col gap-3">
            <span className="text-xs text-muted">
              Configure one or more Discord Webhook URLs. Fired price alerts will be posted to all active webhooks simultaneously.
            </span>

            {discordWebhooks.map((url, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className={`${inputCls} font-mono`}
                  value={url}
                  onChange={(e) => handleDiscordChange(idx, e.target.value)}
                  placeholder="https://discord.com/api/webhooks/…"
                />
                <button
                  type="button"
                  onClick={() => handleTestDiscord(url, idx)}
                  disabled={testingId === `discord-${idx}`}
                  className="px-2.5 py-2 text-xs btn-ghost cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {testingId === `discord-${idx}` ? "Testing…" : "Test"}
                </button>
                {discordWebhooks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDiscord(idx)}
                    title="Remove Webhook"
                    className="p-2 text-muted hover:text-rose-400 cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddDiscord}
              className="px-3 py-1.5 text-xs font-mono font-medium text-accent border border-accent/30 rounded hover:bg-accent/10 transition-colors w-fit self-start mt-1 cursor-pointer flex items-center gap-1"
            >
              + Add Discord Webhook
            </button>
          </div>
        </fieldset>

        {/* ---- Telegram Notifications Section ---- */}
        <fieldset className="hairline p-5 flex flex-col gap-4 rounded-lg bg-panel/40">
          <legend className="px-1 text-sm font-semibold flex items-center gap-2">
            <span>Telegram Bot Notifications</span>
          </legend>

          <label className="flex items-center justify-between gap-3 cursor-pointer hairline-b pb-3">
            <span className="text-sm font-medium">
              Enable Telegram Notifications
            </span>
            <input
              type="checkbox"
              checked={notifyTelegram}
              onChange={(e) => setNotifyTelegram(e.target.checked)}
              className="accent-accent h-4 w-4 cursor-pointer"
            />
          </label>

          <div className="flex flex-col gap-4">
            <span className="text-xs text-muted">
              Add your Telegram Bot Token (from <code>@BotFather</code>) and Chat ID (from <code>@userinfobot</code> or group chat ID). You can add multiple Telegram bot destinations.
            </span>

            {telegramDests.map((dest, idx) => (
              <div
                key={dest.id}
                className="p-3 border border-hairline rounded bg-surface/30 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <input
                    className={`${inputCls} max-w-xs font-sans text-xs`}
                    value={dest.label || ""}
                    onChange={(e) =>
                      handleTelegramChange(dest.id, "label", e.target.value)
                    }
                    placeholder={`Destination #${idx + 1} (e.g. VIP Channel)`}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestTelegram(dest)}
                      disabled={testingId === `telegram-${dest.id}`}
                      className="px-2.5 py-1.5 text-xs btn-ghost cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      {testingId === `telegram-${dest.id}`
                        ? "Testing…"
                        : "Test Telegram"}
                    </button>
                    {telegramDests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTelegram(dest.id)}
                        title="Remove Telegram destination"
                        className="p-1.5 text-muted hover:text-rose-400 cursor-pointer"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px] text-muted font-mono">
                    Bot Token
                    <input
                      type="text"
                      className={`${inputCls} font-mono text-xs`}
                      value={dest.bot_token}
                      onChange={(e) =>
                        handleTelegramChange(
                          dest.id,
                          "bot_token",
                          e.target.value
                        )
                      }
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted font-mono">
                    Chat ID
                    <input
                      type="text"
                      className={`${inputCls} font-mono text-xs`}
                      value={dest.chat_id}
                      onChange={(e) =>
                        handleTelegramChange(
                          dest.id,
                          "chat_id",
                          e.target.value
                        )
                      }
                      placeholder="-100123456789 or 987654321"
                    />
                  </label>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddTelegram}
              className="px-3 py-1.5 text-xs font-mono font-medium text-accent border border-accent/30 rounded hover:bg-accent/10 transition-colors w-fit cursor-pointer flex items-center gap-1"
            >
              + Add Telegram Destination
            </button>
          </div>
        </fieldset>

        {/* ---- TradingView Automated Webhook Ingestion ---- */}
        <fieldset className="hairline p-5 flex flex-col gap-5 rounded-lg bg-panel/40 border border-line">
          <legend className="px-1 text-sm font-semibold flex items-center gap-2">
            <span>📡 TradingView Webhook Automation</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 font-mono uppercase">
              Feature 3
            </span>
          </legend>

          <p className="text-xs text-muted leading-relaxed">
            Automate your trading setup radar. Pipe TradingView alerts (PineScript indicators, strategy executions, or price crossings) directly into your MOCHEX Watchlist or Trades table with zero manual entry.
          </p>

          {/* Webhook Endpoint URL */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-panel-soft/60 border border-line">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <span>🔗</span> Your Personal Webhook URL
              </span>
              <button
                type="button"
                onClick={copyWebhookUrl}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent text-white hover:opacity-90 transition-all cursor-pointer shadow-sm flex items-center gap-1"
              >
                {copiedWebhook ? "✓ Copied!" : "📋 Copy Webhook URL"}
              </button>
            </div>
            <input
              type="text"
              readOnly
              value={webhookUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full px-3 py-2 text-xs font-mono rounded bg-panel border border-line text-accent select-all outline-none"
            />
            <span className="text-[11px] text-muted">
              Paste this URL into the <strong>Webhook URL</strong> field in your TradingView Alert configuration dialog.
            </span>
          </div>

          {/* Secret Key & Roll */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-panel-soft/40 border border-line">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text">Webhook Secret Key</span>
              <div className="flex items-center gap-2">
                <input
                  type={showSecret ? "text" : "password"}
                  readOnly
                  value={webhookSecret}
                  className="font-mono text-xs px-2.5 py-1 rounded bg-panel border border-line text-muted w-48 sm:w-64 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((p) => !p)}
                  className="text-xs text-muted hover:text-text px-2 py-1 rounded hover:bg-panel border border-line cursor-pointer"
                >
                  {showSecret ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRegenerateSecret}
              disabled={regeneratingSecret}
              className="text-xs text-muted hover:text-loss border border-line hover:border-loss/40 px-3 py-1.5 rounded-lg transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
            >
              {regeneratingSecret ? "Regenerating…" : "🔄 Roll Secret"}
            </button>
          </div>

          {/* Interactive TradingView Alert Message Generator */}
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-panel/60 border border-line">
            <div className="flex items-center justify-between flex-wrap gap-2 hairline-b pb-2.5">
              <div>
                <h4 className="text-xs font-semibold text-text flex items-center gap-1.5">
                  <span>🛠️</span> TradingView Alert Message Generator
                </h4>
                <p className="text-[11px] text-muted">
                  Configure and copy ready-to-paste JSON into your TradingView Alert Message box.
                </p>
              </div>
              <button
                type="button"
                onClick={copyGeneratedPayload}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-panel hover:bg-panel-soft border border-line text-text hover:text-accent transition-colors cursor-pointer flex items-center gap-1"
              >
                {copiedPayload ? "✓ Copied JSON!" : "📋 Copy Alert JSON"}
              </button>
            </div>

            {/* Generator Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Destination</span>
                <select
                  value={genType}
                  onChange={(e) => setGenType(e.target.value as "watchlist" | "trade")}
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs outline-none focus:border-accent cursor-pointer"
                >
                  <option value="watchlist">Watchlist Setup (Radar)</option>
                  <option value="trade">Direct Trade (Execute)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Symbol / Ticker</span>
                <input
                  type="text"
                  value={genSymbol}
                  onChange={(e) => setGenSymbol(e.target.value)}
                  placeholder="{{ticker}}"
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Position Side</span>
                <select
                  value={genSide}
                  onChange={(e) => setGenSide(e.target.value as "long" | "short")}
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs outline-none focus:border-accent cursor-pointer"
                >
                  <option value="long">↗ LONG</option>
                  <option value="short">↘ SHORT</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Order Type</span>
                <select
                  value={genOrderType}
                  onChange={(e) => setGenOrderType(e.target.value as "limit" | "market")}
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs outline-none focus:border-accent cursor-pointer"
                >
                  <option value="limit">Limit Order</option>
                  <option value="market">Market Order</option>
                </select>
              </label>

              {genType === "watchlist" && (
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">Trigger Price</span>
                  <input
                    type="text"
                    value={genTrigger}
                    onChange={(e) => setGenTrigger(e.target.value)}
                    placeholder="{{close}} or 64200"
                    className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
                  />
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Entry Price</span>
                <input
                  type="text"
                  value={genEntry}
                  onChange={(e) => setGenEntry(e.target.value)}
                  placeholder="{{close}} or 64000"
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Stop Loss (SL)</span>
                <input
                  type="text"
                  value={genStopLoss}
                  onChange={(e) => setGenStopLoss(e.target.value)}
                  placeholder="62500"
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted">Take Profit (TP)</span>
                <input
                  type="text"
                  value={genTakeProfit}
                  onChange={(e) => setGenTakeProfit(e.target.value)}
                  placeholder="68000"
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="text-[11px] text-muted">Thesis / Notes</span>
                <input
                  type="text"
                  value={genNotes}
                  onChange={(e) => setGenNotes(e.target.value)}
                  placeholder="e.g. 4H SuperTrend Bullish Flip"
                  className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent"
                />
              </label>
            </div>

            {/* Live Generated JSON Codebox */}
            <div className="relative mt-1">
              <pre className="p-3 rounded-lg bg-panel-soft/80 border border-line text-accent font-mono text-[11px] overflow-x-auto select-all leading-relaxed">
                {generatedJsonString}
              </pre>
            </div>

            {/* Test Webhook Action */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendTestWebhook}
                  disabled={testingWebhook}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-panel hover:bg-panel-soft border border-accent/40 text-accent transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>⚡</span>
                  <span>{testingWebhook ? "Sending Test Alert…" : "Send Test Alert Now"}</span>
                </button>
              </div>
              {testWebhookStatus && (
                <span className={`text-xs font-mono ${testWebhookStatus.startsWith("✓") ? "text-gain" : "text-loss"}`}>
                  {testWebhookStatus}
                </span>
              )}
            </div>
          </div>
        </fieldset>

        {/* ---- Desktop & Watchlist Settings Section ---- */}
        <fieldset className="hairline p-5 flex flex-col gap-4 rounded-lg bg-panel/40">
          <legend className="px-1 text-sm font-semibold">General & Desktop</legend>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyDesktop}
                onChange={(e) => setNotifyDesktop(e.target.checked)}
                className="accent-accent h-4 w-4 cursor-pointer"
              />
              <span className="text-sm font-medium">
                Send Desktop Toast Notifications
              </span>
            </label>
            <button
              type="button"
              onClick={handleTestDesktop}
              disabled={testingId === "desktop"}
              className="px-3 py-1.5 text-xs btn-ghost cursor-pointer disabled:opacity-50"
            >
              {testingId === "desktop" ? "Testing…" : "Test Desktop"}
            </button>
          </div>

          <div className="hairline-t pt-3 flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Watchlist Refresh Interval (seconds)
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={3}
                  max={3600}
                  step={1}
                  className={`${inputCls} max-w-32`}
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(e.target.value)}
                  placeholder="10"
                />
                <span className="text-xs text-muted/70">sec</span>
              </div>
              <span className="text-xs text-muted/70">
                Frequency at which the Watchlist polls MEXC futures API for live prices (3 to 3600 sec).
              </span>
            </label>
          </div>
        </fieldset>

        {/* ---- Audio Sound FX & Proximity Alarms Section ---- */}
        <fieldset className="hairline p-5 flex flex-col gap-4 rounded-lg bg-panel/40">
          <legend className="px-1 text-sm font-semibold flex items-center gap-2">
            <span>🔊 Web Audio FX & Price Proximity Alarms</span>
          </legend>

          <label className="flex items-center justify-between gap-3 cursor-pointer hairline-b pb-3">
            <span className="text-sm font-medium">Enable Sound Effects</span>
            <input
              type="checkbox"
              checked={audioEnabled}
              onChange={(e) => {
                const next = e.target.checked;
                setAudioStateEnabled(next);
                saveAudioEnabled(next);
                if (next) playTriggerSound();
              }}
              className="accent-accent h-4 w-4 cursor-pointer"
            />
          </label>

          {/* Web Audio Price Proximity Alarm Controls */}
          <div className="hairline-b pb-4 flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-sm font-medium block">Web Audio Price Proximity Alarms</span>
                <span className="text-xs text-muted">
                  Synthesize real-time audio warnings when market prices approach Watchlist triggers.
                </span>
              </div>
              <input
                type="checkbox"
                checked={proximityEnabled}
                onChange={(e) => setProximityEnabled(e.target.checked)}
                className="accent-accent h-4 w-4 cursor-pointer"
              />
            </label>

            {proximityEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 bg-panel/60 p-3 rounded-xl border border-line">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Proximity Threshold Distance
                  <select
                    value={proximityThreshold}
                    onChange={(e) => setProximityThreshold(e.target.value)}
                    className={`${inputCls} font-mono`}
                  >
                    <option value="0.25">0.25% (Ultra Tight)</option>
                    <option value="0.5">0.50% (Default - Recommended)</option>
                    <option value="1.0">1.00% (Medium Distance)</option>
                    <option value="2.0">2.00% (Wide Distance)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  Alarm Sound Tone Preset
                  <select
                    value={alarmPreset}
                    onChange={(e) => setAlarmPreset(e.target.value as AlarmSoundPreset)}
                    className={`${inputCls} font-mono`}
                  >
                    <option value="radar_ping">📡 Radar Ping (Dual High Tone)</option>
                    <option value="breakout_bell">🔔 Breakout Bell (Triad Chord)</option>
                    <option value="sonar_pulse">🌊 Sonar Pulse (Deep Echo)</option>
                    <option value="chime">✨ Soft Chime (Gentle Alert)</option>
                  </select>
                </label>

                <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-1 border-t border-line">
                  <span className="text-xs text-muted">Audition synthesized sound tone:</span>
                  <button
                    type="button"
                    onClick={() => playAlarmSound(alarmPreset)}
                    className="px-3 py-1.5 text-xs font-bold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🔊 Test Alarm Tone</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Sound Volume ({(audioVolume * 100).toFixed(0)}%)
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setAudioStateVolume(val);
                  saveAudioVolume(val);
                }}
                className="w-full accent-accent cursor-pointer"
              />
            </label>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span className="text-xs text-muted">Test Sound FX:</span>
              <button
                type="button"
                onClick={playTriggerSound}
                className="px-2.5 py-1 text-xs btn-ghost cursor-pointer"
              >
                🔔 Trigger Chime
              </button>
              <button
                type="button"
                onClick={playTpSound}
                className="px-2.5 py-1 text-xs btn-ghost cursor-pointer text-gain"
              >
                🎯 Take Profit Hit
              </button>
              <button
                type="button"
                onClick={playSlSound}
                className="px-2.5 py-1 text-xs btn-ghost cursor-pointer text-loss"
              >
                🛑 Stop Loss Hit
              </button>
            </div>
          </div>
        </fieldset>

        {/* Screenshot Storage & Google Drive Backend */}
        <fieldset className="border border-line rounded-lg p-4 sm:p-5 flex flex-col gap-4 bg-panel/40">
          <legend className="px-1 text-xs uppercase tracking-wider font-semibold text-text font-mono flex items-center gap-1.5">
            <span>💾</span>
            <span>Screenshot Storage &amp; Google Drive</span>
          </legend>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted leading-relaxed">
              Save your Supabase storage quota by saving trade chart screenshots directly to your personal <span className="text-text font-semibold">15 GB free Google Drive</span>.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-panel-soft/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-canvas border border-line flex items-center justify-center text-lg">
                📁
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text">Google Drive Cloud Storage</span>
                  {gdriveConnected ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-gain/15 text-gain border border-gain/20">
                      ✓ Connected
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-panel text-muted border border-line">
                      Not Connected
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted">
                  {gdriveConnected && gdriveEmail
                    ? `Connected as ${gdriveEmail} · 0 bytes used on Supabase`
                    : "Connect to save 100% of Supabase storage quota"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {gdriveConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnectGdrive}
                  disabled={disconnectingGdrive}
                  className="px-3 py-1.5 text-xs text-loss hover:bg-loss/10 border border-loss/20 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {disconnectingGdrive ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href="/api/auth/google-drive"
                  className="accent-btn px-3.5 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>🔗</span>
                  <span>Connect Google Drive</span>
                </a>
              )}
            </div>
          </div>

          <div className="rounded-md border border-line/60 bg-canvas/50 p-3 text-[11px] text-muted flex flex-col gap-1.5">
            <span className="text-text font-medium">💡 Zero-Setup Alternative:</span>
            <span>
              You don&apos;t even need to connect an account! You can paste any public Google Drive sharing link (<code className="text-accent text-[10px]">https://drive.google.com/file/d/...</code>) directly into any trade, and Mochex will automatically render it as a direct image.
            </span>
          </div>
        </fieldset>

        {/* Support Server Hosting & Tip Jar Card */}
        <fieldset className="border border-line rounded-lg p-4 sm:p-5 flex flex-col gap-3 bg-panel-soft/30">
          <legend className="px-1 text-xs uppercase tracking-wider font-semibold text-text font-mono flex items-center gap-1.5">
            <span>💖</span>
            <span>Support MOCHEX Server Hosting</span>
          </legend>

          <p className="text-xs text-muted leading-relaxed">
            MOCHEX is 100% free and open for the trading community. If this terminal helps your execution and you would like to help cover server hosting and live market data costs, tips via Solana, Base/EVM, Bitcoin, or zero-cost exchange discounts are warmly appreciated.
          </p>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setTipModalOpen(true)}
              className="accent-btn px-4 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <span>☕</span>
              <span>Open Crypto Tip Jar & Hosting Support</span>
            </button>
          </div>
        </fieldset>

        {error && <div className="text-sm text-rose-400 font-mono">{error}</div>}
        {status && <div className="text-sm text-emerald-400 font-mono">{status}</div>}

        <button
          type="submit"
          disabled={saving || Boolean(testingId)}
          className="px-5 py-2.5 text-sm accent-btn font-semibold cursor-pointer w-fit rounded-md disabled:opacity-60"
        >
          {saving ? "Saving settings…" : "Save Settings"}
        </button>
      </form>

      {/* Crypto Tip Jar & Server Hosting Support Modal */}
      <TipModal isOpen={tipModalOpen} onClose={() => setTipModalOpen(false)} />
    </div>
  );
}

function genId() {
  return Math.random().toString(36).substring(2, 9);
}