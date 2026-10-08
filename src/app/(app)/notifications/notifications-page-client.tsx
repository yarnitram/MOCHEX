"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification, NotificationType } from "@/lib/types";
import {
  formatFullDate,
  formatTimeAgo,
  notificationIcon,
  notificationColor,
  notificationBg,
  notificationTypeLabel,
  parseNotificationMetadata,
  type ParsedNotificationMeta,
} from "@/lib/notification-utils";
import { playAlarmSound } from "@/lib/audio-alarm-engine";

interface NotificationsPageClientProps {
  initialNotifications: Notification[];
  initialUnreadCount: number;
  initialTotal: number;
}

const PAGE_SIZE = 30;

type CategoryFilter = "all" | "triggers" | "trades" | "system";

export function NotificationsPageClient({
  initialNotifications,
  initialUnreadCount,
  initialTotal,
}: NotificationsPageClientProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters & Search
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination & Selection
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialNotifications.length >= PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Set<string>>(new Set());

  // Coin icon cache
  const [coinIcons, setCoinIcons] = useState<Record<string, string>>({});

  // Sound test status toast
  const [soundFeedback, setSoundFeedback] = useState<string | null>(null);

  // Custom confirmation modal state (replaces native window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    confirmTone?: "danger" | "primary";
    action: () => Promise<void> | void;
  } | null>(null);

  const router = useRouter();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Fetch token icons from MEXC futures
  useEffect(() => {
    let cancelled = false;
    async function loadCoinIcons() {
      try {
        const res = await fetch("/api/mexc/futures");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const icons: Record<string, string> = {};
        if (Array.isArray(data.tickers)) {
          for (const t of data.tickers) {
            if (t.symbol && t.baseCoinIconUrl) {
              const clean = t.symbol.replace(/_USDT$/i, "").toUpperCase();
              icons[clean] = t.baseCoinIconUrl;
              icons[t.symbol.toUpperCase()] = t.baseCoinIconUrl;
            }
          }
        }
        setCoinIcons(icons);
      } catch {
        // Silently fail if exchange unavailable
      }
    }
    loadCoinIcons();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real-time Supabase Subscription for live notifications
  useEffect(() => {
    const channel = supabase
      .channel("notifications-realtime-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new as Notification;
          if (!newNotif || !newNotif.id) return;

          setNotifications((prev) => {
            // Avoid duplicate insertions
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });
          setTotal((t) => t + 1);
          if (!newNotif.read) {
            setUnreadCount((u) => u + 1);
            playAlarmSound("radar_ping");
          }

          // Highlight newly arrived alert
          setNewlyArrivedIds((prev) => new Set([...prev, newNotif.id]));
          setTimeout(() => {
            setNewlyArrivedIds((prev) => {
              const next = new Set(prev);
              next.delete(newNotif.id);
              return next;
            });
          }, 4000);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const updated = payload.new as Notification;
          if (!updated) return;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        (payload) => {
          const old = payload.old as { id?: string };
          if (!old?.id) return;
          setNotifications((prev) => prev.filter((n) => n.id !== old.id));
        }
      )
      .subscribe();

    // 60s polling fallback to keep unread badges synchronized (with tab visibility guard)
    const fetchUnread = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const json = await res.json();
          if (typeof json.count === "number") setUnreadCount(json.count);
        }
      } catch {
        // Fallback polling error
      }
    };

    const poller = setInterval(fetchUnread, 60_000);
    const handleVisibility = () => {
      if (!document.hidden) fetchUnread();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poller);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [supabase]);

  // Derived parsed notification metadata map
  const parsedMap = useMemo(() => {
    const map = new Map<string, ParsedNotificationMeta>();
    for (const n of notifications) {
      map.set(n.id, parseNotificationMetadata(n));
    }
    return map;
  }, [notifications]);

  // Category counts
  const categoryCounts = useMemo(() => {
    let triggers = 0;
    let trades = 0;
    let system = 0;

    for (const n of notifications) {
      const meta = parsedMap.get(n.id);
      if (
        n.type === "watchlist_trigger" ||
        meta?.badgeLabel.includes("TRIGGER") ||
        meta?.badgeLabel.includes("LIMIT")
      ) {
        triggers++;
      } else if (
        n.type === "trade_alert" ||
        n.type === "sl_tp_hit" ||
        meta?.badgeLabel.includes("TRADE") ||
        meta?.badgeLabel.includes("TP") ||
        meta?.badgeLabel.includes("STOP LOSS") ||
        meta?.badgeLabel.includes("TRADINGVIEW")
      ) {
        trades++;
      } else {
        system++;
      }
    }

    return { all: notifications.length, triggers, trades, system };
  }, [notifications, parsedMap]);

  // Filtered Notifications based on category, unread toggle, and search
  const filteredNotifications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return notifications.filter((n) => {
      // 1. Unread filter
      if (unreadOnly && n.read) return false;

      // 2. Category filter
      const meta = parsedMap.get(n.id);
      if (category === "triggers") {
        const isTrigger =
          n.type === "watchlist_trigger" ||
          meta?.badgeLabel.includes("TRIGGER") ||
          meta?.badgeLabel.includes("LIMIT");
        if (!isTrigger) return false;
      } else if (category === "trades") {
        const isTrade =
          n.type === "trade_alert" ||
          n.type === "sl_tp_hit" ||
          meta?.badgeLabel.includes("TRADE") ||
          meta?.badgeLabel.includes("TP") ||
          meta?.badgeLabel.includes("STOP LOSS") ||
          meta?.badgeLabel.includes("TRADINGVIEW");
        if (!isTrade) return false;
      } else if (category === "system") {
        const isSystem =
          n.type === "system" ||
          n.type === "risk_warning" ||
          meta?.badgeLabel === "SYSTEM" ||
          meta?.badgeLabel === "RISK";
        if (!isSystem) return false;
      }

      // 3. Search query
      if (q) {
        const sym = meta?.symbol?.toLowerCase() ?? "";
        const title = n.title.toLowerCase();
        const msg = n.message.toLowerCase();
        const badge = meta?.badgeLabel.toLowerCase() ?? "";
        return (
          sym.includes(q) || title.includes(q) || msg.includes(q) || badge.includes(q)
        );
      }

      return true;
    });
  }, [notifications, category, unreadOnly, searchQuery, parsedMap]);

  // Indeterminate state for select-all checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.size > 0 && selectedIds.size < filteredNotifications.length;
    }
  }, [selectedIds, filteredNotifications.length]);

  // Load more notifications from API
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications((prev) => {
          const existing = new Set(prev.map((n) => n.id));
          const fresh = (data.notifications as Notification[]).filter(
            (n) => !existing.has(n.id)
          );
          return [...prev, ...fresh];
        });
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, hasMore]);

  // Mark specific IDs as read or unread
  const setReadStatus = useCallback(
    async (ids: string[], targetRead: boolean) => {
      if (ids.length === 0) return;
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, read: targetRead }),
        });

        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, read: targetRead } : n))
        );

        if (targetRead) {
          setUnreadCount((prev) => Math.max(0, prev - ids.length));
        } else {
          setUnreadCount((prev) => prev + ids.length);
        }

        setSelectedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      } catch {
        // Silently fail
      }
    },
    []
  );

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, read: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      setSelectedIds(new Set());
    } catch {
      // Silently fail
    }
  };

  // Delete notifications by IDs
  const deleteNotifications = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeletingIds((prev) => new Set([...prev, ...ids]));

    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      setNotifications((prev) => {
        const idSet = new Set(ids);
        const removed = prev.filter((n) => idSet.has(n.id));
        const removedUnread = removed.filter((n) => !n.read).length;
        setUnreadCount((u) => Math.max(0, u - removedUnread));
        setTotal((t) => Math.max(0, t - removed.length));
        return prev.filter((n) => !idSet.has(n.id));
      });

      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch {
      // Silently fail
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, []);

  // Clear all read notifications
  const handleClearAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allRead: true }),
      });

      setNotifications((prev) => {
        const unreadOnlyList = prev.filter((n) => !n.read);
        setTotal(unreadOnlyList.length);
        return unreadOnlyList;
      });
      setSelectedIds(new Set());
    } catch {
      // Silently fail
    }
  };

  // Sound test button handler
  const handleTestSound = () => {
    playAlarmSound("radar_ping");
    setSoundFeedback("Chime played! (Audio active)");
    setTimeout(() => setSoundFeedback(null), 3000);
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select all visible filtered items
  const handleSelectAllVisible = () => {
    if (selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  // Primary row click: mark read and follow link if not clicking specific action
  const handleRowClick = (notification: Notification) => {
    if (!notification.read) {
      setReadStatus([notification.id], true);
    }
    const meta = parsedMap.get(notification.id);
    const targetUrl = notification.link || meta?.chartUrl || meta?.tradesUrl;
    if (targetUrl) {
      router.push(targetUrl);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header & Quick Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow">Inbox & Signals</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-gain/10 text-gain border border-gain/20">
              <span className="w-1.5 h-1.5 rounded-full bg-gain animate-pulse" />
              Live Sync
            </span>
          </div>
          <h1 className="text-2xl font-bold brand tracking-tight">Notifications</h1>
          <p className="text-muted text-xs mt-1">
            {unreadCount > 0 ? (
              <span>
                <strong className="text-accent font-semibold">{unreadCount} unread</strong> signals · {total} total logged
              </span>
            ) : (
              <span>All caught up · {total} signals logged</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sound Alarm Tester */}
          <button
            type="button"
            onClick={handleTestSound}
            className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 text-muted hover:text-text"
            title="Test Web Audio alarm chime"
          >
            <span>🔊</span>
            <span>{soundFeedback || "Test Sound"}</span>
          </button>

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="accent-btn px-3 py-1.5 text-xs font-medium"
            >
              Mark all read
            </button>
          )}

          {/* Clear all read */}
          {notifications.some((n) => n.read) && (
            <button
              type="button"
              onClick={() => {
                setConfirmModal({
                  open: true,
                  title: "Clear All Read Notifications?",
                  message:
                    "This will permanently remove all read alerts from your inbox. Unread alerts will remain.",
                  confirmLabel: "Clear Read",
                  confirmTone: "danger",
                  action: handleClearAllRead,
                });
              }}
              className="px-3 py-1.5 text-xs rounded border border-line text-muted hover:text-loss hover:bg-loss/10 transition-colors"
            >
              Clear read
            </button>
          )}

          {/* Alert Settings shortcut */}
          <Link
            href="/settings"
            className="btn-ghost px-2.5 py-1.5 text-xs text-muted hover:text-text flex items-center gap-1"
            title="Configure Telegram, Discord & Desktop Notifications"
          >
            <span>⚙️</span>
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </div>

      {/* 2. Category Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1 bg-panel border border-line rounded-lg p-1 overflow-x-auto" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            onClick={() => setCategory("all")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              category === "all"
                ? "bg-paper text-text shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            <span>All</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-panel-soft text-muted font-mono">
              {categoryCounts.all}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "triggers"}
            onClick={() => setCategory("triggers")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              category === "triggers"
                ? "bg-paper text-text shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            <span>🔔 Triggers</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-panel-soft text-muted font-mono">
              {categoryCounts.triggers}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "trades"}
            onClick={() => setCategory("trades")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              category === "trades"
                ? "bg-paper text-text shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            <span>📈 Trades & SL/TP</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-panel-soft text-muted font-mono">
              {categoryCounts.trades}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={category === "system"}
            onClick={() => setCategory("system")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              category === "system"
                ? "bg-paper text-text shadow-sm"
                : "text-muted hover:text-text"
            }`}
          >
            <span>📢 System</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-panel-soft text-muted font-mono">
              {categoryCounts.system}
            </span>
          </button>
        </div>

        {/* Right Controls: Search & Unread Toggle */}
        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative flex-1 sm:w-64">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search token, price, alert..."
              className="w-full bg-panel border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Unread Only Toggle */}
          <button
            type="button"
            onClick={() => setUnreadOnly((prev) => !prev)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 font-medium whitespace-nowrap ${
              unreadOnly
                ? "bg-accent/15 border-accent text-accent"
                : "bg-panel border-line text-muted hover:text-text"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${unreadOnly ? "bg-accent" : "bg-muted"}`} />
            <span>Unread only</span>
          </button>
        </div>
      </div>

      {/* 3. Bulk Selection Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-accent/10 border border-accent/30 rounded-lg shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-accent font-mono">
              {selectedIds.size} selected
            </span>
            <span className="text-muted text-xs hidden sm:inline">
              of {filteredNotifications.length} visible
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReadStatus(Array.from(selectedIds), true)}
              className="px-2.5 py-1 text-xs rounded bg-panel border border-line text-text hover:bg-paper transition-colors font-medium"
            >
              ✓ Mark read
            </button>
            <button
              type="button"
              onClick={() => setReadStatus(Array.from(selectedIds), false)}
              className="px-2.5 py-1 text-xs rounded bg-panel border border-line text-text hover:bg-paper transition-colors font-medium"
            >
              ✉ Mark unread
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmModal({
                  open: true,
                  title: `Delete ${selectedIds.size} notification(s)?`,
                  message: "This action cannot be undone.",
                  confirmLabel: "Delete",
                  confirmTone: "danger",
                  action: () => deleteNotifications(Array.from(selectedIds)),
                });
              }}
              className="px-2.5 py-1 text-xs rounded border border-loss/30 text-loss hover:bg-loss/10 transition-colors font-medium"
            >
              🗑️ Delete
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="btn-ghost px-2 py-1 text-xs text-muted hover:text-text"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 4. Notification Items List */}
      <div className="bg-panel border border-line rounded-lg overflow-hidden shadow-sm">
        {loading ? (
          <div className="px-6 py-16 text-center text-muted text-sm">
            <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
            <p>Loading signals & notifications…</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-4xl mb-3">🔕</div>
            <h3 className="text-base font-semibold text-text">
              {searchQuery
                ? `No notifications matching "${searchQuery}"`
                : unreadOnly
                ? "No unread notifications"
                : category !== "all"
                ? `No ${category} signals logged yet`
                : "No notifications yet"}
            </h3>
            <p className="text-xs text-muted mt-1.5 max-w-sm mx-auto">
              {searchQuery
                ? "Try searching for a different token symbol or clearing your query."
                : unreadOnly
                ? "You are completely caught up! New price hits and webhook alerts will appear in real time."
                : "Watchlist price alarms, SL/TP hits, and TradingView webhooks will stream here automatically."}
            </p>
            {(searchQuery || unreadOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setUnreadOnly(false);
                }}
                className="mt-4 px-3 py-1.5 text-xs rounded border border-line text-text hover:bg-paper"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Table / List Header toolbar */}
            <div className="px-4 py-2.5 bg-paper/40 border-b border-line flex items-center justify-between text-xs text-muted">
              <div className="flex items-center gap-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={
                    selectedIds.size === filteredNotifications.length &&
                    filteredNotifications.length > 0
                  }
                  onChange={handleSelectAllVisible}
                  className="w-4 h-4 accent-accent cursor-pointer"
                  aria-label="Select all visible"
                />
                <span className="font-mono">
                  Showing {filteredNotifications.length} of {notifications.length}
                </span>
              </div>
              <span className="text-[11px] font-mono hidden sm:inline">
                Click any row to jump to Chart or Trades
              </span>
            </div>

            {/* List Rows */}
            <ul role="list" className="divide-y divide-line">
              {filteredNotifications.map((notification) => {
                const unread = !notification.read;
                const selected = selectedIds.has(notification.id);
                const isDeleting = deletingIds.has(notification.id);
                const isNewArrival = newlyArrivedIds.has(notification.id);
                const meta = parsedMap.get(notification.id)!;
                const tokenSymbol = meta.symbol;
                const coinIconUrl = tokenSymbol ? coinIcons[tokenSymbol] : null;

                return (
                  <li
                    key={notification.id}
                    className={`group relative flex items-start gap-3.5 px-4 py-3.5 transition-all duration-150 border-l-4 ${
                      isNewArrival
                        ? "border-accent bg-accent/15 animate-pulse"
                        : unread
                        ? "border-accent bg-accent/5 hover:bg-accent/10"
                        : "border-transparent hover:bg-paper/40"
                    } ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(notification.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-4 h-4 accent-accent flex-shrink-0 cursor-pointer"
                      aria-label="Select notification"
                    />

                    {/* Token Icon or Type Symbol Avatar */}
                    <div className="flex-shrink-0 mt-0.5">
                      {tokenSymbol && coinIconUrl ? (
                        <img
                          src={coinIconUrl}
                          alt={tokenSymbol}
                          className="w-9 h-9 rounded-full object-contain bg-panel border border-line shadow-sm"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : tokenSymbol ? (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-panel-soft to-panel border border-line flex items-center justify-center text-xs font-bold font-mono text-accent shadow-sm">
                          {tokenSymbol.slice(0, 3)}
                        </div>
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-base ${notificationBg(
                            notification.type
                          )} ${notificationColor(notification.type)}`}
                        >
                          {notificationIcon(notification.type)}
                        </div>
                      )}
                    </div>

                    {/* Main Content Body */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowClick(notification)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(notification);
                        }
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer outline-none"
                    >
                      {/* Top Meta Line: Badges, Title, Time */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {/* Unread indicator dot */}
                          {unread && (
                            <span
                              className="w-2 h-2 rounded-full bg-accent flex-shrink-0 animate-pulse"
                              title="Unread"
                            />
                          )}

                          {/* Token Symbol Chip */}
                          {tokenSymbol && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-panel-soft border border-line text-text">
                              {tokenSymbol}
                            </span>
                          )}

                          {/* Event Type Badge */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wide uppercase border ${meta.badgeColorClass}`}
                          >
                            {meta.badgeLabel}
                          </span>

                          {/* Title */}
                          <h3
                            className={`text-sm truncate text-text ${
                              unread ? "font-bold" : "font-medium"
                            }`}
                          >
                            {notification.title}
                          </h3>
                        </div>

                        {/* Timestamp */}
                        <time
                          className="flex-shrink-0 text-[11px] font-mono text-muted whitespace-nowrap"
                          dateTime={notification.created_at}
                          title={formatFullDate(notification.created_at)}
                        >
                          {formatTimeAgo(notification.created_at)}
                        </time>
                      </div>

                      {/* Message Content */}
                      <p className="mt-1 text-xs text-muted/90 line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>

                      {/* Price Callouts & Action Bar */}
                      <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap pt-1">
                        {/* Extracted Metrics */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                          {meta.triggerPrice && (
                            <span className="px-1.5 py-0.5 rounded bg-panel border border-line text-muted">
                              Trigger: <strong className="text-text">{meta.triggerPrice}</strong>
                            </span>
                          )}
                          {meta.lastPrice && (
                            <span className="px-1.5 py-0.5 rounded bg-panel border border-line text-muted">
                              Fired: <strong className="text-accent">{meta.lastPrice}</strong>
                            </span>
                          )}
                        </div>

                        {/* Smart Direct Action Buttons */}
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 📈 Chart Shortcut */}
                          {meta.chartUrl && (
                            <Link
                              href={meta.chartUrl}
                              className="px-2 py-0.5 text-[11px] rounded bg-panel border border-line hover:border-accent text-accent hover:bg-accent/10 transition-colors font-medium flex items-center gap-1"
                              title={`Open ${tokenSymbol} live chart`}
                            >
                              <span>📈</span>
                              <span>Chart</span>
                            </Link>
                          )}

                          {/* 📋 Trades Shortcut */}
                          <Link
                            href={meta.tradesUrl || "/trades"}
                            className="px-2 py-0.5 text-[11px] rounded bg-panel border border-line hover:border-text text-muted hover:text-text hover:bg-paper transition-colors font-medium flex items-center gap-1"
                            title="View trade execution details"
                          >
                            <span>📋</span>
                            <span>Trades</span>
                          </Link>

                          {/* 🔗 External MEXC */}
                          {meta.mexcUrl && (
                            <a
                              href={meta.mexcUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="px-2 py-0.5 text-[11px] rounded bg-panel border border-line hover:border-text text-muted hover:text-text hover:bg-paper transition-colors font-medium hidden md:inline-flex items-center gap-1"
                              title="Open on MEXC Futures"
                            >
                              <span>MEXC ↗</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Row Hover Actions (Read/Unread Toggle & Delete) */}
                    <div
                      className="flex-shrink-0 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Mark Read/Unread Toggle */}
                      <button
                        type="button"
                        onClick={() => setReadStatus([notification.id], !notification.read)}
                        className="p-1 rounded text-muted hover:text-text hover:bg-paper transition-colors"
                        title={notification.read ? "Mark as unread" : "Mark as read"}
                        aria-label={notification.read ? "Mark as unread" : "Mark as read"}
                      >
                        {notification.read ? (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="4" fill="currentColor" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </button>

                      {/* Row Delete */}
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            open: true,
                            title: "Delete Notification?",
                            message: "Are you sure you want to delete this alert from your inbox?",
                            confirmLabel: "Delete",
                            confirmTone: "danger",
                            action: () => deleteNotifications([notification.id]),
                          });
                        }}
                        className="p-1 rounded text-muted hover:text-loss hover:bg-loss/10 transition-colors"
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Load More Pagination Button */}
            {hasMore && (
              <div className="px-4 py-4 border-t border-line text-center bg-paper/20">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 text-xs btn-ghost rounded font-medium disabled:opacity-50"
                >
                  {loadingMore ? "Loading more signals…" : "Load older notifications"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 5. Custom Sleek MOCHEX Dark Confirmation Modal */}
      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-panel border border-line rounded-xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-text">{confirmModal.title}</h3>
            <p className="text-xs text-muted leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 text-xs rounded border border-line text-muted hover:text-text hover:bg-paper transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const act = confirmModal.action;
                  setConfirmModal(null);
                  await act();
                }}
                className={`px-4 py-1.5 text-xs rounded font-semibold transition-colors ${
                  confirmModal.confirmTone === "danger"
                    ? "bg-loss hover:bg-loss/90 text-white"
                    : "accent-btn"
                }`}
              >
                {confirmModal.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}