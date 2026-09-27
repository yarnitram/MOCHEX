"use client";

import { useState, useEffect, useMemo } from "react";
import type { TelegramDestination, Account, RiskSettings } from "@/lib/types";
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
  isAdmin?: boolean;
  account?: Account | null;
  riskSettings?: RiskSettings | null;
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

// ─── Tab Config ──────────────────────────────────────────────────────────────

type TabId = "profile" | "notifications" | "audio" | "integrations" | "risk" | "storage" | "support";

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  desc: string;
  adminOnly?: boolean;
}

const TABS: TabConfig[] = [
  { id: "profile",       label: "Profile",       icon: "👤", desc: "Public handle & showcase" },
  { id: "notifications", label: "Alerts",        icon: "🔔", desc: "Discord, Telegram & Desktop" },
  { id: "audio",         label: "Audio & Radar", icon: "🔊", desc: "SFX volume & proximity radar" },
  { id: "integrations",  label: "Integrations",  icon: "📡", desc: "TradingView webhooks" },
  { id: "risk",          label: "Risk Limits",   icon: "⚖️", desc: "Drawdown & position sizing" },
  { id: "storage",       label: "Cloud Storage", icon: "💾", desc: "Google Drive screenshot bucket", adminOnly: true },
  { id: "support",       label: "Support",       icon: "💖", desc: "Server hosting & tip jar" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).substring(2, 9);
}

const inputCls =
  "hairline bg-panel px-3 py-2 text-sm outline-none focus:border-accent w-full rounded";

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-panel/40 p-6 sm:p-7 flex flex-col gap-5 shadow-xs ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-sm font-semibold text-text flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {title}
      </h3>
      {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text group-hover:text-accent transition-colors">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
          checked ? "bg-accent border-accent" : "bg-panel-soft border-line"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SettingsForm({ userEmail, isAdmin = false, account, riskSettings, initial }: Props) {
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  // ── Risk Limits State ──
  const [dailyLoss, setDailyLoss] = useState(
    riskSettings?.max_daily_loss != null ? String(riskSettings.max_daily_loss) : ""
  );
  const [positionRisk, setPositionRisk] = useState(
    riskSettings?.max_position_risk_pct != null
      ? String(riskSettings.max_position_risk_pct)
      : ""
  );
  const [maxOpen, setMaxOpen] = useState(
    riskSettings?.max_open_positions != null
      ? String(riskSettings.max_open_positions)
      : ""
  );

  // ── Profile State ──
  const [username, setUsername] = useState(initial.username || "");
  const [displayName, setDisplayName] = useState(initial.display_name || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [twitterHandle, setTwitterHandle] = useState(initial.twitter_handle || "");
  const [telegramChannel, setTelegramChannel] = useState(initial.telegram_channel || "");
  const [isProfilePublic, setIsProfilePublic] = useState(initial.is_profile_public !== false);

  // ── Discord State ──
  const [discordWebhooks, setDiscordWebhooks] = useState<string[]>(
    initial.discord_webhooks.length > 0 ? initial.discord_webhooks : [""]
  );
  const [notifyDiscord, setNotifyDiscord] = useState(initial.notify_discord);

  // ── Telegram State ──
  const [telegramDests, setTelegramDests] = useState<TelegramDestination[]>(
    initial.telegram_destinations.length > 0
      ? initial.telegram_destinations
      : [{ id: genId(), bot_token: "", chat_id: "", label: "" }]
  );
  const [notifyTelegram, setNotifyTelegram] = useState(initial.notify_telegram);
  const [notifyDesktop, setNotifyDesktop] = useState(initial.notify_desktop);
  const [refreshInterval, setRefreshInterval] = useState(String(initial.refresh_interval_sec));

  // ── Audio State ──
  const [proximityEnabled, setProximityEnabled] = useState(initial.proximity_alarm_enabled !== false);
  const [proximityThreshold, setProximityThreshold] = useState(String(initial.proximity_threshold_pct ?? 0.5));
  const [alarmPreset, setAlarmPreset] = useState<AlarmSoundPreset>(
    (initial.alarm_sound_preset as AlarmSoundPreset) || "radar_ping"
  );
  const [audioEnabled, setAudioStateEnabled] = useState(true);
  const [audioVolume, setAudioStateVolume] = useState(0.5);

  // ── Google Drive State (admin only) ──
  const [gdriveConnected, setGdriveConnected] = useState(initial.google_drive_connected ?? false);
  const [gdriveEmail, setGdriveEmail] = useState(initial.google_drive_email ?? null);
  const [gdriveToken, setGdriveToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [disconnectingGdrive, setDisconnectingGdrive] = useState(false);
  const [testingDriveUpload, setTestingDriveUpload] = useState(false);
  const [storageBackend, setStorageBackend] = useState<"auto" | "google_drive" | "supabase">(
    initial.screenshot_storage_backend || "auto"
  );
  const [driveTestResult, setDriveTestResult] = useState<{
    success: boolean;
    folderUrl?: string;
    fileUrl?: string;
    viewUrl?: string;
    elapsedMs?: number;
    message?: string;
  } | null>(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);

  // ── Webhook State ──
  const [webhookSecret, setWebhookSecret] = useState(initial.webhook_secret || "");
  const [showSecret, setShowSecret] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);
  const [genType, setGenType] = useState<"watchlist" | "trade">("watchlist");
  const [genSymbol, setGenSymbol] = useState("{{ticker}}");
  const [genSide, setGenSide] = useState<"long" | "short">("long");
  const [genOrderType, setGenOrderType] = useState<"limit" | "market">("limit");
  const [genTrigger, setGenTrigger] = useState("{{close}}");
  const [genEntry, setGenEntry] = useState("{{close}}");
  const [genStopLoss, setGenStopLoss] = useState("62500");
  const [genTakeProfit, setGenTakeProfit] = useState("68000");
  const [genNotes, setGenNotes] = useState("4H EMA 200 Rebound");

  // ── Form State ──
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://mochex.app";
  const webhookUrl = `${origin}/api/webhooks/tradingview?key=${webhookSecret}`;

  // ─── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    setAudioStateEnabled(isAudioEnabled());
    setAudioStateVolume(getAudioVolume());

    fetch("/api/auth/google-drive/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.siteWideActive) {
          setGdriveConnected(true);
          if (data.email) setGdriveEmail(data.email);
          if (data.refreshToken) setGdriveToken(data.refreshToken);
          fetch("/api/auth/google-drive/test")
            .then((r) => r.json())
            .then((info) => {
              if (info.connected && info.folderUrl) setDriveFolderUrl(info.folderUrl);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gdrive")?.startsWith("connected")) {
        setStatus("Site-wide Google Drive connected successfully! ✓");
        setGdriveConnected(true);
        if (params.get("email")) setGdriveEmail(params.get("email"));
        if (params.get("token")) setGdriveToken(params.get("token"));
        setActiveTab("storage");
      }
      if (params.get("error")) {
        setError(params.get("error"));
      }
    }
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────

  function handleCopyToken() {
    if (!gdriveToken) return;
    navigator.clipboard.writeText(`GOOGLE_DRIVE_REFRESH_TOKEN=${gdriveToken}`);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  }

  async function handleTestDriveUpload() {
    setTestingDriveUpload(true);
    setDriveTestResult(null);
    try {
      const res = await fetch("/api/auth/google-drive/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to upload test image");
      setDriveTestResult(data);
      if (data.folderUrl) setDriveFolderUrl(data.folderUrl);
      setStatus("Google Drive upload test succeeded! ✓");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Drive upload test failed";
      setDriveTestResult({ success: false, message: msg });
      setError(msg);
    } finally {
      setTestingDriveUpload(false);
    }
  }

  async function handleDisconnectGdrive() {
    if (!window.confirm("Disconnect site-wide Google Drive? Screenshots will fall back to Supabase.")) return;
    setDisconnectingGdrive(true);
    try {
      const res = await fetch("/api/auth/google-drive/disconnect", { method: "POST" });
      if (res.ok) {
        setGdriveConnected(false);
        setGdriveEmail(null);
        setGdriveToken(null);
        setDriveFolderUrl(null);
        setDriveTestResult(null);
        setStatus("Google Drive disconnected ✓");
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to disconnect");
      }
    } catch {
      setError("Failed to disconnect Google Drive");
    } finally {
      setDisconnectingGdrive(false);
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  }

  async function handleRegenerateSecret() {
    if (!window.confirm("Regenerate webhook secret? Existing TradingView alerts will stop working.")) return;
    setRegeneratingSecret(true);
    try {
      const res = await fetch("/api/settings/webhook-secret", { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate");
      const d = await res.json();
      setWebhookSecret(d.webhook_secret);
      setStatus("Webhook secret regenerated ✓");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegeneratingSecret(false);
    }
  }

  const generatedJsonString = useMemo(() => {
    if (genType === "watchlist") {
      return JSON.stringify({
        symbol: genSymbol, position: genSide, order_type: genOrderType,
        trigger_price: genTrigger, entry_price: genEntry,
        stop_loss: Number(genStopLoss) || 62500,
        take_profit: Number(genTakeProfit) || 68000, notes: genNotes,
      }, null, 2);
    }
    return JSON.stringify({
      action: "trade", symbol: genSymbol, side: genSide, order_type: genOrderType,
      entry_price: genEntry, stop_loss: Number(genStopLoss) || 62500,
      take_profit: Number(genTakeProfit) || 68000, leverage: 10, margin_usd: 100, notes: genNotes,
    }, null, 2);
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
      const testPayload = genType === "watchlist"
        ? { symbol: "BTC_USDT", position: genSide, order_type: genOrderType, trigger_price: 64200, entry_price: 64000, stop_loss: 62500, take_profit: 68000, notes: "Test Alert from MOCHEX Settings" }
        : { action: "trade", symbol: "BTC_USDT", side: genSide, order_type: genOrderType, entry_price: 64000, stop_loss: 62500, take_profit: 68000, leverage: 10, margin_usd: 50, notes: "Test Trade from MOCHEX Settings" };
      const res = await fetch(`/api/webhooks/tradingview?key=${webhookSecret}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(testPayload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Webhook test failed");
      }
      const resJson = await res.json();
      setTestWebhookStatus(`✓ Test ${resJson.action} alert received! Added ${resJson.symbol}.`);
    } catch (err) {
      setTestWebhookStatus(`✕ ${(err as Error).message}`);
    } finally {
      setTestingWebhook(false);
    }
  }

  function handleAddDiscord() { setDiscordWebhooks([...discordWebhooks, ""]); }
  function handleRemoveDiscord(index: number) { setDiscordWebhooks(discordWebhooks.filter((_, i) => i !== index)); }
  function handleDiscordChange(index: number, value: string) {
    const next = [...discordWebhooks]; next[index] = value; setDiscordWebhooks(next);
  }

  async function handleTestDiscord(url: string, index: number) {
    if (!url.trim()) { setError("Enter a Discord webhook URL first."); return; }
    setTestingId(`discord-${index}`); setStatus(null); setError(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discord_webhook_url: url }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Test failed"); }
      setStatus(`Test notification sent to Discord Webhook #${index + 1} ✓`);
    } catch (err) { setError((err as Error).message); } finally { setTestingId(null); }
  }

  function handleAddTelegram() { setTelegramDests([...telegramDests, { id: genId(), bot_token: "", chat_id: "", label: "" }]); }
  function handleRemoveTelegram(id: string) { setTelegramDests(telegramDests.filter((t) => t.id !== id)); }
  function handleTelegramChange(id: string, field: keyof TelegramDestination, value: string) {
    setTelegramDests(telegramDests.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  async function handleTestTelegram(dest: TelegramDestination) {
    if (!dest.bot_token.trim() || !dest.chat_id.trim()) { setError("Provide Bot Token and Chat ID."); return; }
    setTestingId(`telegram-${dest.id}`); setStatus(null); setError(null);
    try {
      const res = await fetch("/api/settings/test-telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bot_token: dest.bot_token, chat_id: dest.chat_id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Telegram test failed"); }
      setStatus(`Test notification sent to Telegram (${dest.label || "Bot"}) ✓`);
    } catch (err) { setError((err as Error).message); } finally { setTestingId(null); }
  }

  async function handleTestDesktop() {
    setTestingId("desktop"); setStatus(null); setError(null);
    try {
      const res = await fetch("/api/settings/test-desktop", { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Test failed"); }
      setStatus("Desktop notification sent ✓");
    } catch (err) { setError((err as Error).message); } finally { setTestingId(null); }
  }

  async function handleSave(e?: React.FormEvent, customStatus?: string) {
    if (e) e.preventDefault();
    setSaving(true); setStatus(null); setError(null);
    const filteredWebhooks = discordWebhooks.map((w) => w.trim()).filter(Boolean);
    const filteredTelegram = telegramDests.map((t) => ({ ...t, bot_token: t.bot_token.trim(), chat_id: t.chat_id.trim(), label: t.label?.trim() || undefined })).filter((t) => t.bot_token && t.chat_id);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim() || null, display_name: displayName.trim() || null,
          bio: bio.trim() || null, twitter_handle: twitterHandle.trim() || null,
          telegram_channel: telegramChannel.trim() || null, is_profile_public: isProfilePublic,
          discord_webhooks: filteredWebhooks, notify_discord: notifyDiscord,
          telegram_destinations: filteredTelegram, notify_telegram: notifyTelegram,
          notify_desktop: notifyDesktop, refresh_interval_sec: Number(refreshInterval) || 10,
          sound_enabled: audioEnabled, proximity_alarm_enabled: proximityEnabled,
          proximity_threshold_pct: Number(proximityThreshold) || 0.5, alarm_sound_preset: alarmPreset,
          screenshot_storage_backend: isAdmin ? storageBackend : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed to save settings"); }

      // Synchronize audio state in browser localStorage
      saveAudioEnabled(audioEnabled);
      saveAudioVolume(audioVolume);

      // Persist risk controls if trading account exists
      if (account) {
        const riskRes = await fetch("/api/risk", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account.id,
            maxDailyLoss: dailyLoss,
            maxPositionRiskPct: positionRisk,
            maxOpenPositions: maxOpen,
          }),
        });
        if (!riskRes.ok) {
          const rd = await riskRes.json().catch(() => ({}));
          throw new Error(rd.error || "Failed to save risk settings");
        }
      }

      setStatus(customStatus || "Settings saved successfully ✓");
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-line">
        <div>
          <p className="eyebrow mb-1">Preferences &amp; Configuration</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text mb-1">Settings</h1>
          <p className="text-sm text-muted">
            Signed in as <span className="font-mono text-accent font-medium">{userEmail}</span>
            {isAdmin && (
              <span className="ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                🛡️ Platform Admin
              </span>
            )}
          </p>
        </div>

        {activeTab !== "support" && (
          <button
            type="button"
            onClick={() => handleSave(undefined, "All settings saved successfully ✓")}
            disabled={saving || Boolean(testingId)}
            className="accent-btn px-5 py-2.5 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm rounded-lg disabled:opacity-60 self-start sm:self-center transition-all"
          >
            {saving ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Saving All…</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Save All Settings</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Mobile Horizontal Tab Scroller (< lg) ── */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-line">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setStatus(null); setError(null); }}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold whitespace-nowrap rounded-lg transition-all cursor-pointer border ${
              activeTab === tab.id
                ? "border-accent bg-accent/15 text-accent shadow-xs"
                : "border-line bg-panel/60 text-muted hover:text-text hover:bg-panel-soft"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.adminOnly && (
              <span className="px-1 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase leading-none">
                Admin
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Desktop 2-Column Grid (lg+) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] items-start gap-8">

        {/* ── Left Sidebar Navigation (lg+) ── */}
        <aside className="hidden lg:flex flex-col gap-4 sticky top-6">
          <div className="rounded-2xl border border-line bg-panel/50 p-2.5 flex flex-col gap-1 shadow-xs">
            <div className="px-3 py-2 text-[11px] font-mono font-bold text-muted uppercase tracking-wider">
              Settings Hub
            </div>
            {visibleTabs.map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setStatus(null); setError(null); }}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all cursor-pointer group ${
                    isSelected
                      ? "bg-accent/15 text-accent border border-accent/30 font-semibold shadow-xs"
                      : "text-muted hover:text-text hover:bg-panel-soft border border-transparent"
                  }`}
                >
                  <span className="text-lg leading-none mt-0.5">{tab.icon}</span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`text-sm ${isSelected ? "text-accent font-semibold" : "text-text group-hover:text-text"}`}>
                        {tab.label}
                      </span>
                      {tab.adminOnly && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted truncate mt-0.5">{tab.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* User Profile Identity Chip */}
          <div className="rounded-2xl border border-line bg-panel-soft/30 p-4 flex flex-col gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center font-bold text-accent">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-text font-semibold truncate text-[11px]">{userEmail}</span>
                <span className="text-[10px] text-muted">
                  {isAdmin ? "Verified Administrator" : "Active Trader"}
                </span>
              </div>
            </div>

            {isAdmin && (
              <a
                href="/admin"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
              >
                <span>🛡️</span>
                <span>Admin Command Center →</span>
              </a>
            )}
          </div>
        </aside>

        {/* ── Right Content Stage ── */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Status / Error Toast Banner */}
          {(status || error) && (
            <div className={`px-4 py-3 rounded-xl border text-xs font-mono flex items-center gap-2 animate-in fade-in duration-200 ${
              error
                ? "bg-loss/10 border-loss/30 text-loss"
                : "bg-gain/10 border-gain/30 text-gain"
            }`}>
              <span>{error ? "✕" : "✓"}</span>
              <span>{error || status}</span>
              <button type="button" onClick={() => { setStatus(null); setError(null); }} className="ml-auto text-muted hover:text-text cursor-pointer">✕</button>
            </div>
          )}

          <form onSubmit={handleSave} className="flex flex-col gap-6">

        {/* ════ PROFILE TAB ════ */}
        {activeTab === "profile" && (
          <div className="flex flex-col gap-5">
            <SectionCard>
              <SectionTitle icon="👤" title="Public Trader Profile" subtitle="Your public-facing identity on MOCHEX. Used on share pages and public portfolios." />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                  Display Name
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sam Trading" className={inputCls} maxLength={40} />
                </label>
                <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                  Username / Vanity URL Handle
                  <div className="flex items-center hairline rounded overflow-hidden focus-within:border-accent">
                    <span className="px-3 py-2 text-xs text-muted font-mono bg-canvas select-none border-r border-line">/</span>
                    <input type="text" value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                      placeholder="samsam" className="flex-1 bg-panel px-3 py-2 text-sm font-mono outline-none" maxLength={20} />
                  </div>
                </label>
              </div>

              <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                Trader Bio &amp; Market Outlook
                <textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. Solana & BTC momentum trader. Sharing high-probability breakouts."
                  className={`${inputCls} resize-none`} />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                  Twitter / X Handle
                  <div className="flex items-center hairline rounded overflow-hidden focus-within:border-accent">
                    <span className="px-3 py-2 text-xs text-muted font-mono bg-canvas select-none border-r border-line">@</span>
                    <input type="text" value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)}
                      placeholder="sam_crypto" className="flex-1 bg-panel px-3 py-2 text-sm outline-none" />
                  </div>
                </label>
                <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                  Telegram Channel URL
                  <input type="text" value={telegramChannel} onChange={(e) => setTelegramChannel(e.target.value)}
                    placeholder="https://t.me/sam_setups" className={inputCls} />
                </label>
              </div>

              <div className="hairline-t pt-4">
                <Toggle
                  checked={isProfilePublic}
                  onChange={setIsProfilePublic}
                  label="Public Trader Showcase Page"
                  description={isProfilePublic ? `Your page is live at /${username || "handle"}` : "Your profile page is hidden from the public."}
                />
              </div>

              {username && (
                <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted uppercase font-mono tracking-wider">Public Profile URL</span>
                    <span className="font-mono text-accent text-sm font-bold">/{username}</span>
                  </div>
                  <a href={`/${username}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer">
                    👁 View Profile
                  </a>
                </div>
              )}
            </SectionCard>

            <div className="flex justify-end">
              <button type="submit" disabled={saving}
                className="px-5 py-2.5 text-sm accent-btn font-semibold cursor-pointer rounded-lg disabled:opacity-60 flex items-center gap-2">
                {saving ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </div>
        )}

        {/* ════ NOTIFICATIONS TAB ════ */}
        {activeTab === "notifications" && (
          <div className="flex flex-col gap-5">

            {/* Desktop */}
            <SectionCard>
              <SectionTitle icon="🖥️" title="Desktop Notifications" subtitle="Browser push notifications for price alerts and trade events." />
              <Toggle checked={notifyDesktop} onChange={setNotifyDesktop} label="Send Desktop Toast Notifications" />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-medium text-muted flex flex-col gap-1.5 flex-1 max-w-48">
                  Watchlist Refresh Interval
                  <div className="flex items-center gap-2">
                    <input type="number" min={3} max={3600} step={1}
                      className={`${inputCls} max-w-24`} value={refreshInterval}
                      onChange={(e) => setRefreshInterval(e.target.value)} placeholder="10" />
                    <span className="text-xs text-muted">sec</span>
                  </div>
                </label>
                <button type="button" onClick={handleTestDesktop} disabled={testingId === "desktop"}
                  className="px-3 py-1.5 text-xs btn-ghost cursor-pointer disabled:opacity-50 self-end">
                  {testingId === "desktop" ? "Testing…" : "🔔 Test Desktop"}
                </button>
              </div>
            </SectionCard>

            {/* Discord */}
            <SectionCard>
              <div className="flex items-center justify-between">
                <SectionTitle icon="💬" title="Discord Webhooks" subtitle="Price alerts posted to your Discord channels." />
                <Toggle checked={notifyDiscord} onChange={setNotifyDiscord} label="" />
              </div>
              <div className="flex flex-col gap-3">
                {discordWebhooks.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input className={`${inputCls} font-mono text-xs`} value={url}
                      onChange={(e) => handleDiscordChange(idx, e.target.value)}
                      placeholder="https://discord.com/api/webhooks/…" />
                    <button type="button" onClick={() => handleTestDiscord(url, idx)} disabled={testingId === `discord-${idx}`}
                      className="px-2.5 py-2 text-xs btn-ghost cursor-pointer whitespace-nowrap disabled:opacity-50">
                      {testingId === `discord-${idx}` ? "…" : "Test"}
                    </button>
                    {discordWebhooks.length > 1 && (
                      <button type="button" onClick={() => handleRemoveDiscord(idx)} title="Remove" className="p-2 text-muted hover:text-loss cursor-pointer">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={handleAddDiscord}
                  className="px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors w-fit cursor-pointer">
                  + Add Webhook
                </button>
              </div>
            </SectionCard>

            {/* Telegram */}
            <SectionCard>
              <div className="flex items-center justify-between">
                <SectionTitle icon="✈️" title="Telegram Bot Notifications" subtitle="Route alerts to Telegram bots and group chats." />
                <Toggle checked={notifyTelegram} onChange={setNotifyTelegram} label="" />
              </div>
              <p className="text-xs text-muted">Add Bot Token from <code>@BotFather</code> and Chat ID from <code>@userinfobot</code>.</p>
              <div className="flex flex-col gap-3">
                {telegramDests.map((dest, idx) => (
                  <div key={dest.id} className="p-3 border border-line rounded-lg bg-surface/20 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <input className={`${inputCls} max-w-xs text-xs`} value={dest.label || ""}
                        onChange={(e) => handleTelegramChange(dest.id, "label", e.target.value)}
                        placeholder={`Destination #${idx + 1} (e.g. VIP Channel)`} />
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleTestTelegram(dest)} disabled={testingId === `telegram-${dest.id}`}
                          className="px-2.5 py-1.5 text-xs btn-ghost cursor-pointer whitespace-nowrap disabled:opacity-50">
                          {testingId === `telegram-${dest.id}` ? "Testing…" : "Test"}
                        </button>
                        {telegramDests.length > 1 && (
                          <button type="button" onClick={() => handleRemoveTelegram(dest.id)} className="p-1.5 text-muted hover:text-loss cursor-pointer">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Bot Token
                        <input type="text" className={`${inputCls} font-mono text-xs`} value={dest.bot_token}
                          onChange={(e) => handleTelegramChange(dest.id, "bot_token", e.target.value)}
                          placeholder="123456789:ABCdef…" />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Chat ID
                        <input type="text" className={`${inputCls} font-mono text-xs`} value={dest.chat_id}
                          onChange={(e) => handleTelegramChange(dest.id, "chat_id", e.target.value)}
                          placeholder="-100123456789" />
                      </label>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={handleAddTelegram}
                  className="px-3 py-1.5 text-xs font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors w-fit cursor-pointer">
                  + Add Telegram Destination
                </button>
              </div>
            </SectionCard>

            <div className="flex justify-end">
              <button type="submit" disabled={saving}
                className="px-5 py-2.5 text-sm accent-btn font-semibold cursor-pointer rounded-lg disabled:opacity-60">
                {saving ? "Saving…" : "Save Notification Settings"}
              </button>
            </div>
          </div>
        )}

        {/* ════ AUDIO TAB ════ */}
        {activeTab === "audio" && (
          <div className="flex flex-col gap-5">
            <SectionCard>
              <SectionTitle icon="🔊" title="Sound Effects" subtitle="Audio feedback for price triggers, take profits, and stop losses." />
              <Toggle checked={audioEnabled} onChange={(next) => { setAudioStateEnabled(next); saveAudioEnabled(next); if (next) playTriggerSound(); }}
                label="Enable Sound Effects" />
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted">
                  Master Volume ({(audioVolume * 100).toFixed(0)}%)
                </label>
                <input type="range" min="0" max="1" step="0.05" value={audioVolume}
                  onChange={(e) => { const val = parseFloat(e.target.value); setAudioStateVolume(val); saveAudioVolume(val); }}
                  className="w-full accent-accent cursor-pointer" />
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-line">
                <span className="text-xs text-muted">Test Sound FX:</span>
                <button type="button" onClick={playTriggerSound} className="px-2.5 py-1 text-xs btn-ghost cursor-pointer">🔔 Trigger</button>
                <button type="button" onClick={playTpSound} className="px-2.5 py-1 text-xs btn-ghost cursor-pointer text-gain">🎯 Take Profit</button>
                <button type="button" onClick={playSlSound} className="px-2.5 py-1 text-xs btn-ghost cursor-pointer text-loss">🛑 Stop Loss</button>
              </div>
            </SectionCard>

            <SectionCard>
              <SectionTitle icon="📡" title="Price Proximity Alarms" subtitle="Synthesized audio warnings when market price approaches a Watchlist trigger." />
              <Toggle checked={proximityEnabled} onChange={setProximityEnabled} label="Enable Proximity Alarms"
                description="Real-time audio alarm when price is within threshold of your trigger." />

              {proximityEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-panel/60 border border-line">
                  <label className="flex flex-col gap-1.5 text-xs text-muted">
                    Proximity Threshold
                    <select value={proximityThreshold} onChange={(e) => setProximityThreshold(e.target.value)}
                      className={`${inputCls} font-mono`}>
                      <option value="0.25">0.25% — Ultra Tight</option>
                      <option value="0.5">0.50% — Default</option>
                      <option value="1.0">1.00% — Medium</option>
                      <option value="2.0">2.00% — Wide</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-muted">
                    Alarm Sound Preset
                    <select value={alarmPreset} onChange={(e) => setAlarmPreset(e.target.value as AlarmSoundPreset)}
                      className={`${inputCls} font-mono`}>
                      <option value="radar_ping">📡 Radar Ping</option>
                      <option value="breakout_bell">🔔 Breakout Bell</option>
                      <option value="sonar_pulse">🌊 Sonar Pulse</option>
                      <option value="chime">✨ Soft Chime</option>
                    </select>
                  </label>
                  <div className="sm:col-span-2 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs text-muted">Preview selected preset:</span>
                    <button type="button" onClick={() => playAlarmSound(alarmPreset)}
                      className="px-3 py-1.5 text-xs font-bold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer">
                      🔊 Test Alarm Tone
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>

            <div className="flex justify-end">
              <button type="submit" disabled={saving}
                className="px-5 py-2.5 text-sm accent-btn font-semibold cursor-pointer rounded-lg disabled:opacity-60">
                {saving ? "Saving…" : "Save Audio Settings"}
              </button>
            </div>
          </div>
        )}

        {/* ════ INTEGRATIONS TAB ════ */}
        {activeTab === "integrations" && (
          <div className="flex flex-col gap-5">
            <SectionCard>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <SectionTitle icon="📡" title="TradingView Webhook Automation"
                  subtitle="Pipe TradingView alerts directly into your MOCHEX Watchlist or Trades table." />
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 font-mono uppercase tracking-wider">
                  Automation
                </span>
              </div>

              {/* Webhook URL */}
              <div className="flex flex-col gap-2 p-4 rounded-xl bg-canvas/60 border border-line">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-semibold text-text">🔗 Your Personal Webhook URL</span>
                  <button type="button" onClick={copyWebhookUrl}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent text-white hover:opacity-90 transition-all cursor-pointer shadow-sm">
                    {copiedWebhook ? "✓ Copied!" : "📋 Copy URL"}
                  </button>
                </div>
                <input type="text" readOnly value={webhookUrl} onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full px-3 py-2 text-xs font-mono rounded bg-panel border border-line text-accent select-all outline-none" />
                <span className="text-[11px] text-muted">Paste this into the Webhook URL field in your TradingView Alert dialog.</span>
              </div>

              {/* Secret Key */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-canvas/40 border border-line">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text">Webhook Secret Key</span>
                  <div className="flex items-center gap-2">
                    <input type={showSecret ? "text" : "password"} readOnly value={webhookSecret}
                      className="font-mono text-xs px-2.5 py-1.5 rounded bg-panel border border-line text-muted w-48 sm:w-64 outline-none" />
                    <button type="button" onClick={() => setShowSecret((p) => !p)}
                      className="text-xs text-muted hover:text-text px-2 py-1 rounded border border-line cursor-pointer">
                      {showSecret ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={handleRegenerateSecret} disabled={regeneratingSecret}
                  className="text-xs text-muted hover:text-loss border border-line hover:border-loss/40 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap">
                  {regeneratingSecret ? "Regenerating…" : "🔄 Roll Secret"}
                </button>
              </div>
            </SectionCard>

            {/* JSON Generator */}
            <SectionCard>
              <SectionTitle icon="🛠️" title="Alert Message Generator" subtitle="Build and copy a ready-to-paste JSON payload for TradingView alerts." />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { label: "Destination", node: <select value={genType} onChange={(e) => setGenType(e.target.value as "watchlist" | "trade")} className="hairline bg-panel px-2.5 py-1.5 rounded text-xs outline-none focus:border-accent cursor-pointer"><option value="watchlist">Watchlist Setup</option><option value="trade">Direct Trade</option></select> },
                  { label: "Symbol", node: <input type="text" value={genSymbol} onChange={(e) => setGenSymbol(e.target.value)} placeholder="{{ticker}}" className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent" /> },
                  { label: "Side", node: <select value={genSide} onChange={(e) => setGenSide(e.target.value as "long" | "short")} className="hairline bg-panel px-2.5 py-1.5 rounded text-xs outline-none focus:border-accent cursor-pointer"><option value="long">↗ LONG</option><option value="short">↘ SHORT</option></select> },
                  { label: "Order Type", node: <select value={genOrderType} onChange={(e) => setGenOrderType(e.target.value as "limit" | "market")} className="hairline bg-panel px-2.5 py-1.5 rounded text-xs outline-none focus:border-accent cursor-pointer"><option value="limit">Limit</option><option value="market">Market</option></select> },
                  ...(genType === "watchlist" ? [{ label: "Trigger Price", node: <input type="text" value={genTrigger} onChange={(e) => setGenTrigger(e.target.value)} placeholder="{{close}}" className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent" /> }] : []),
                  { label: "Entry Price", node: <input type="text" value={genEntry} onChange={(e) => setGenEntry(e.target.value)} placeholder="{{close}}" className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent" /> },
                  { label: "Stop Loss", node: <input type="text" value={genStopLoss} onChange={(e) => setGenStopLoss(e.target.value)} placeholder="62500" className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent" /> },
                  { label: "Take Profit", node: <input type="text" value={genTakeProfit} onChange={(e) => setGenTakeProfit(e.target.value)} placeholder="68000" className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent" /> },
                ].map(({ label, node }) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">{label}</span>
                    {node}
                  </label>
                ))}
                <label className="flex flex-col gap-1 sm:col-span-3">
                  <span className="text-[11px] text-muted">Notes / Thesis</span>
                  <input type="text" value={genNotes} onChange={(e) => setGenNotes(e.target.value)}
                    className="hairline bg-panel px-2.5 py-1.5 rounded text-xs font-mono outline-none focus:border-accent" />
                </label>
              </div>

              <div className="relative">
                <pre className="p-3 rounded-lg bg-canvas border border-line text-accent font-mono text-[11px] overflow-x-auto select-all leading-relaxed">
                  {generatedJsonString}
                </pre>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={copyGeneratedPayload}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-panel hover:bg-panel-soft border border-line text-text hover:text-accent transition-colors cursor-pointer">
                    {copiedPayload ? "✓ Copied JSON!" : "📋 Copy Alert JSON"}
                  </button>
                  <button type="button" onClick={handleSendTestWebhook} disabled={testingWebhook}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-panel hover:bg-panel-soft border border-accent/40 text-accent transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                    ⚡ {testingWebhook ? "Sending…" : "Send Test Alert"}
                  </button>
                </div>
                {testWebhookStatus && (
                  <span className={`text-xs font-mono ${testWebhookStatus.startsWith("✓") ? "text-gain" : "text-loss"}`}>
                    {testWebhookStatus}
                  </span>
                )}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ════ STORAGE TAB (ADMIN ONLY) ════ */}
        {activeTab === "storage" && isAdmin && (
          <div className="flex flex-col gap-5">
            {/* Admin notice */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-accent/8 border border-accent/25 text-xs text-accent font-medium">
              <span>🛡️</span>
              <span>This section is only visible to <strong>Admin</strong> accounts. Configure the site-wide Google Drive storage bucket that all users share.</span>
            </div>

            {/* Storage Backend Selector */}
            <SectionCard>
              <SectionTitle icon="🗄️" title="Screenshot Storage Engine" subtitle="Choose how chart snapshots and uploads are persisted platform-wide." />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "auto", title: "Auto (Recommended)", desc: "Uses Google Drive when authorized, falling back to Supabase automatically." },
                  { id: "google_drive", title: "Google Drive Bucket", desc: "Strictly routes to Google Drive. Saves 100% of Supabase bandwidth quota." },
                  { id: "supabase", title: "Supabase Storage", desc: "Store screenshots directly in Supabase trade-screenshots bucket." },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStorageBackend(opt.id as any)}
                    className={`p-3.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      storageBackend === opt.id
                        ? "border-accent bg-accent/10 shadow-xs"
                        : "border-line bg-canvas/40 hover:bg-panel-soft hover:border-line/80"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-text">{opt.title}</span>
                      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        storageBackend === opt.id ? "border-accent bg-accent" : "border-muted"
                      }`}>
                        {storageBackend === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleSave(undefined, "Storage engine preferences saved ✓")}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm accent-btn font-semibold cursor-pointer rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {saving ? "Saving…" : "Save Storage Preferences"}
                </button>
              </div>
            </SectionCard>

            <SectionCard>
              <SectionTitle icon="💾" title="Site-Wide Google Drive Bucket"
                subtitle="Use a single centralized Google Drive folder as the free cloud storage for the entire platform." />

              <div className="rounded-xl border border-line bg-panel-soft/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-canvas border border-line flex items-center justify-center text-2xl">📁</div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text">Site-Wide Drive Bucket</span>
                      {gdriveConnected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-gain/15 text-gain border border-gain/20 flex items-center gap-1.5 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-gain animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-panel text-muted border border-line">Inactive</span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted">
                      {gdriveConnected
                        ? `Connected: ${gdriveEmail || "Central Bucket"} · All screenshots route here`
                        : "Authorize once to activate Drive uploads for all users"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {gdriveConnected ? (
                    <button type="button" onClick={handleDisconnectGdrive} disabled={disconnectingGdrive}
                      className="px-3 py-1.5 text-xs text-loss hover:bg-loss/10 border border-loss/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50">
                      {disconnectingGdrive ? "Disconnecting…" : "Disconnect Bucket"}
                    </button>
                  ) : (
                    <a href="/api/auth/google-drive"
                      className="accent-btn px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer shadow-sm">
                      ⚡ Authorize Site-Wide Google Drive
                    </a>
                  )}
                </div>
              </div>

              {/* Connected: test & navigate */}
              {gdriveConnected && (
                <div className="rounded-xl border border-line bg-panel-soft/20 p-4 flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                        📁 Destination: <span className="font-mono text-accent">Mochex Trade Screenshots</span>
                      </span>
                      <span className="text-[11px] text-muted">Located in Google Drive root. Test connectivity below.</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={handleTestDriveUpload} disabled={testingDriveUpload}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                        {testingDriveUpload ? "⏳ Testing…" : "🧪 Test Drive Upload"}
                      </button>
                      <a href={driveFolderUrl || "https://drive.google.com/drive/search?q=Mochex%20Trade%20Screenshots"}
                        target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-panel hover:bg-panel-soft text-text border border-line transition-colors flex items-center gap-1.5 cursor-pointer">
                        📁 Open in Drive ↗
                      </a>
                    </div>
                  </div>

                  {driveTestResult && (
                    <div className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 animate-in fade-in duration-150 ${driveTestResult.success ? "bg-gain/10 border-gain/30 text-gain" : "bg-loss/10 border-loss/30 text-loss"}`}>
                      <div className="flex items-center justify-between font-bold">
                        <span>{driveTestResult.success ? "✓ Upload Test Passed!" : "✕ Upload Test Failed"}</span>
                        {driveTestResult.elapsedMs && <span className="font-mono text-[11px] font-normal text-muted">Latency: {driveTestResult.elapsedMs}ms</span>}
                      </div>
                      <p className="text-[11px] text-text">{driveTestResult.message || (driveTestResult.success ? "Folder verified and test file uploaded." : "Error uploading to Drive.")}</p>
                      {driveTestResult.success && (
                        <div className="flex items-center gap-3 pt-1">
                          {driveTestResult.viewUrl && <a href={driveTestResult.viewUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent font-semibold underline">View Uploaded File ↗</a>}
                          {driveTestResult.folderUrl && <a href={driveTestResult.folderUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent font-semibold underline">Open Folder ↗</a>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Vercel helper */}
              {gdriveConnected && gdriveToken && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text">
                      🚀 Vercel Production Deployment
                      <span className="text-[10px] font-mono text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/20">Ready</span>
                    </div>
                    <p className="text-[11px] text-muted">Add this to Vercel → Project Settings → Environment Variables:</p>
                    <code className="text-[11px] font-mono text-accent bg-canvas/80 px-2 py-1 rounded border border-line break-all max-w-xl select-all">
                      GOOGLE_DRIVE_REFRESH_TOKEN={gdriveToken.slice(0, 16)}...{gdriveToken.slice(-6)}
                    </code>
                  </div>
                  <button type="button" onClick={handleCopyToken}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors whitespace-nowrap self-end sm:self-center cursor-pointer shadow-sm">
                    {copiedToken ? "Copied ✓" : "Copy Token"}
                  </button>
                </div>
              )}

              {/* How it works */}
              <div className="rounded-lg border border-line/60 bg-canvas/40 p-3.5 text-[11px] text-muted flex flex-col gap-1.5">
                <span className="text-text font-semibold text-xs">💡 How this works</span>
                <span>1. Authorizing creates a folder <span className="text-text font-mono font-semibold">Mochex Trade Screenshots</span> in your Google Drive.</span>
                <span>2. Any user on the platform who uploads a screenshot saves their file into this folder.</span>
                <span>3. Files are served via Google&apos;s CDN — <code className="text-accent text-[10px]">lh3.googleusercontent.com/d/…</code> — using 0 KB of Supabase quota.</span>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ════ RISK TAB ════ */}
        {activeTab === "risk" && (
          <div className="flex flex-col gap-5">
            <SectionCard>
              <SectionTitle
                icon="⚖️"
                title="Account Risk Controls"
                subtitle={
                  account?.name
                    ? `${account.name} (${account.broker || "Default"}) — Automated guardrails for drawdown and position sizing`
                    : "Configure execution and drawdown guardrails for your trading account."
                }
              />

              {!account ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300">
                  ⚠️ No active trading account detected. Create an account in your Portfolio or Trades section to link risk guardrails.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                    <span>Max Daily Loss (USD)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={dailyLoss}
                      onChange={(e) => setDailyLoss(e.target.value)}
                      placeholder="e.g. 500"
                      className={inputCls}
                    />
                    <span className="text-[11px] text-muted">
                      When today&apos;s realized loss exceeds this, the analytics strip flags a stop-for-the-day warning.
                    </span>
                  </label>

                  <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                    <span>Max Position Risk (%)</span>
                    <input
                      type="number"
                      step="0.05"
                      value={positionRisk}
                      onChange={(e) => setPositionRisk(e.target.value)}
                      placeholder="e.g. 1.0"
                      className={inputCls}
                    />
                    <span className="text-[11px] text-muted">
                      Recommended risk percentage per individual trade entry.
                    </span>
                  </label>

                  <label className="text-xs font-medium text-muted flex flex-col gap-1.5">
                    <span>Max Open Positions</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={maxOpen}
                      onChange={(e) => setMaxOpen(e.target.value)}
                      placeholder="e.g. 3"
                      className={inputCls}
                    />
                    <span className="text-[11px] text-muted">
                      Maximum simultaneous open positions allowed before flagging exposure alerts.
                    </span>
                  </label>
                </div>
              )}

              <div className="rounded-lg border border-line/60 bg-canvas/40 p-3.5 text-[11px] text-muted flex flex-col gap-1">
                <span className="text-text font-semibold text-xs">🛡️ How Risk Guardrails Protect You</span>
                <span>• When cumulative daily losses breach your limit, the Trades and Analytics dashboard warns you to preserve capital.</span>
                <span>• Position risk and open position count prevent over-leveraging and revenge trading.</span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => handleSave(undefined, "Risk controls updated successfully ✓")}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm accent-btn font-semibold cursor-pointer rounded-lg disabled:opacity-60 flex items-center gap-2"
                >
                  {saving ? "Saving…" : "Save Risk Controls"}
                </button>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ════ SUPPORT TAB ════ */}
        {activeTab === "support" && (
          <div className="flex flex-col gap-5">
            <SectionCard>
              <SectionTitle icon="💖" title="Support MOCHEX Server Hosting"
                subtitle="MOCHEX is 100% free for the trading community. Help cover server and live market data costs." />
              <p className="text-xs text-muted leading-relaxed">
                Tips via Solana, Base/EVM, Bitcoin, or zero-cost exchange referral discounts are warmly appreciated. Every contribution helps keep the platform running and free for everyone.
              </p>
              <div>
                <button type="button" onClick={() => setTipModalOpen(true)}
                  className="accent-btn px-4 py-2.5 text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-sm rounded-lg">
                  ☕ Open Crypto Tip Jar &amp; Hosting Support
                </button>
              </div>
            </SectionCard>
          </div>
        )}

        {/* Bottom Save Action */}
        {activeTab !== "support" && (
          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || Boolean(testingId)}
              className="accent-btn px-6 py-2.5 text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-sm rounded-lg disabled:opacity-60"
            >
              {saving ? "Saving changes…" : "Save Changes"}
            </button>
            {status && <span className="text-xs font-mono text-gain">{status}</span>}
            {error && <span className="text-xs font-mono text-loss">{error}</span>}
          </div>
        )}

          </form>
        </div>

      </div>

      <TipModal isOpen={tipModalOpen} onClose={() => setTipModalOpen(false)} />
    </div>
  );
}