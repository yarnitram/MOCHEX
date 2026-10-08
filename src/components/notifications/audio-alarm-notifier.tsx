"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { playAlarmSound, AlarmSoundPreset } from "@/lib/audio-alarm-engine";
import { cleanSymbol, fmtPx } from "@/lib/format";

interface ProximityAlarmToast {
  id: string;
  symbol: string;
  distancePct: number;
  triggerPrice: number;
  lastPrice: number;
  timestamp: number;
}

interface ProximityItem {
  id: string;
  symbol: string;
  trigger_price: number | null;
  alert_fired: boolean;
}

export function AudioAlarmNotifier() {
  const [toasts, setToasts] = useState<ProximityAlarmToast[]>([]);
  const cooldownsRef = useRef<Record<string, number>>({});

  // In-memory caches to prevent polling Supabase on every 10s tick
  const settingsRef = useRef<{
    loadedAt: number;
    sound_enabled?: boolean;
    proximity_alarm_enabled?: boolean;
    proximity_threshold_pct?: number;
    alarm_sound_preset?: AlarmSoundPreset;
  } | null>(null);

  const watchlistRef = useRef<{
    loadedAt: number;
    items: ProximityItem[];
  } | null>(null);

  // Fetch and cache user settings (valid for 5 minutes)
  const getSettings = useCallback(async () => {
    const now = Date.now();
    if (settingsRef.current && now - settingsRef.current.loadedAt < 300_000) {
      return settingsRef.current;
    }
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return settingsRef.current;
      const json = await res.json();
      const s = json?.settings;
      if (s) {
        settingsRef.current = {
          loadedAt: now,
          sound_enabled: s.sound_enabled,
          proximity_alarm_enabled: s.proximity_alarm_enabled,
          proximity_threshold_pct: Number(s.proximity_threshold_pct || 0.5),
          alarm_sound_preset: s.alarm_sound_preset || "radar_ping",
        };
      }
      return settingsRef.current;
    } catch {
      return settingsRef.current;
    }
  }, []);

  // Fetch and cache watchlist items (valid for 2 minutes)
  const getWatchlist = useCallback(async () => {
    const now = Date.now();
    if (watchlistRef.current && now - watchlistRef.current.loadedAt < 120_000) {
      return watchlistRef.current.items;
    }
    try {
      const res = await fetch("/api/watchlist");
      if (!res.ok) return watchlistRef.current?.items || [];
      const json = await res.json();
      if (Array.isArray(json?.items)) {
        const filtered: ProximityItem[] = json.items
          .filter((i: ProximityItem) => !i.alert_fired && i.trigger_price && i.trigger_price > 0)
          .map((i: ProximityItem) => ({
            id: i.id,
            symbol: i.symbol,
            trigger_price: i.trigger_price,
            alert_fired: i.alert_fired,
          }));
        watchlistRef.current = { loadedAt: now, items: filtered };
        return filtered;
      }
      return watchlistRef.current?.items || [];
    } catch {
      return watchlistRef.current?.items || [];
    }
  }, []);

  const checkProximity = useCallback(async () => {
    // If tab is hidden or minimized, DO NOT poll or process
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    try {
      const settings = await getSettings();
      if (!settings?.sound_enabled || !settings?.proximity_alarm_enabled) {
        return;
      }

      const items = await getWatchlist();
      if (items.length === 0) return;

      const thresholdPct = settings.proximity_threshold_pct || 0.5;
      const preset: AlarmSoundPreset = settings.alarm_sound_preset || "radar_ping";

      // Only fetch MEXC tickers on the 10-second loop (0 Supabase usage!)
      const tickersRes = await fetch("/api/mexc/futures");
      if (!tickersRes.ok) return;
      const tickersJson = await tickersRes.json();
      if (!tickersJson.tickers) return;

      const tickers: Array<{ symbol: string; lastPrice: number }> = tickersJson.tickers;
      const tickerMap = new Map<string, number>();
      for (const t of tickers) {
        tickerMap.set(t.symbol, t.lastPrice);
      }

      const now = Date.now();
      const newToasts: ProximityAlarmToast[] = [];
      let triggeredSound = false;

      for (const item of items) {
        if (!item.trigger_price) continue;

        const lastPx = tickerMap.get(item.symbol.toUpperCase());
        if (!lastPx || lastPx <= 0) continue;

        const diff = Math.abs(lastPx - item.trigger_price);
        const distPct = (diff / item.trigger_price) * 100;

        if (distPct <= thresholdPct) {
          const cooldownKey = `${item.symbol}_${item.trigger_price}`;
          const lastFiredTime = cooldownsRef.current[cooldownKey] || 0;

          // 60 second audio & toast cooldown per item level
          if (now - lastFiredTime > 60_000) {
            cooldownsRef.current[cooldownKey] = now;
            triggeredSound = true;

            newToasts.push({
              id: `toast_${Date.now()}_${item.id}`,
              symbol: item.symbol,
              distancePct: distPct,
              triggerPrice: item.trigger_price,
              lastPrice: lastPx,
              timestamp: now,
            });
          }
        }
      }

      if (triggeredSound) {
        playAlarmSound(preset);
      }

      if (newToasts.length > 0) {
        setToasts((prev) => [...newToasts, ...prev].slice(0, 3));
      }
    } catch (err) {
      console.error("Audio proximity alarm check error:", err);
    }
  }, [getSettings, getWatchlist]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!interval) {
        checkProximity();
        interval = setInterval(checkProximity, 10_000);
      }
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkProximity]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const cleanSym = cleanSymbol(toast.symbol);
        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-panel/95 border border-amber-500/50 shadow-2xl shadow-amber-500/10 p-4 rounded-2xl text-text flex items-start justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300 backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-lg font-bold shrink-0 animate-pulse">
                🔊
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm font-mono text-amber-400">
                    {cleanSym} / USDT
                  </h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                    {toast.distancePct.toFixed(2)}% Away
                  </span>
                </div>
                <p className="text-xs text-text mt-1">
                  Near Trigger: <strong className="text-amber-400">{fmtPx(toast.triggerPrice)}</strong> (Last: {fmtPx(toast.lastPrice)})
                </p>
              </div>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 text-muted hover:text-text rounded-lg hover:bg-panel-soft transition-colors cursor-pointer"
              title="Dismiss Alarm Toast"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
