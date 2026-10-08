"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import {
  formatTimeAgo,
  notificationIcon,
  notificationColor,
  parseNotificationMetadata,
} from "@/lib/notification-utils";

interface NotificationBellProps {
  initialUnreadCount?: number;
}

const POLL_INTERVAL = 60_000; // 60 seconds

export function NotificationBell({ initialUnreadCount = 0 }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const supabase = createClient();

  // Fetch unread count
  async function fetchUnreadCount() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // Silently fail for polling
    }
  }

  // Fetch recent notifications for dropdown
  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=5");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }

  // Mark notifications as read
  async function markAsRead(ids: string[]) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      // Update local state optimistically
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
      );
      // Refetch count
      fetchUnreadCount();
    } catch {
      // Silently fail
    }
  }

  // Handle notification click
  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      markAsRead([notification.id]);
    }
    const meta = parseNotificationMetadata(notification);
    const target = notification.link || meta.chartUrl || meta.tradesUrl;
    if (target) {
      router.push(target);
      router.refresh();
    }
    setIsOpen(false);
  }

  // Mark all as read
  async function handleMarkAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }

  // Open the dropdown toggle
  function handleToggle() {
    setIsOpen((prev) => !prev);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Poll for unread count
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUnreadCount();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="relative p-2 text-muted hover:text-text transition-colors rounded-lg hover:bg-panel"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-5 bg-loss text-[10px] font-medium text-panel rounded-full flex items-center justify-center px-1.5 animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-96 bg-panel border border-line shadow-lg rounded-lg overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 duration-150"
          role="menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 hairline-b">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-accent hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-muted text-sm">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-muted text-sm">
                No notifications yet
              </div>
            ) : (
              <ul role="list" className="divide-y divide-line">
                {notifications.map((notification) => {
                  const meta = parseNotificationMetadata(notification);
                  return (
                    <li key={notification.id} role="menuitem">
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          !notification.read ? "bg-accent/10 hover:bg-accent/15" : "hover:bg-panel"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`flex-shrink-0 mt-0.5 ${notificationColor(notification.type)}`}
                            aria-hidden="true"
                          >
                            {notificationIcon(notification.type)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                {meta.symbol && (
                                  <span className="px-1 py-0.2 rounded text-[10px] font-mono font-bold bg-panel border border-line text-text">
                                    {meta.symbol}
                                  </span>
                                )}
                                <span className={`px-1 py-0.2 rounded text-[9px] font-mono uppercase border ${meta.badgeColorClass}`}>
                                  {meta.badgeLabel}
                                </span>
                                <p className={`text-xs truncate ${!notification.read ? "font-bold text-text" : "font-medium text-text/90"}`}>
                                  {notification.title}
                                </p>
                              </div>
                              <time className="flex-shrink-0 text-[10px] font-mono text-muted" dateTime={notification.created_at}>
                                {formatTimeAgo(notification.created_at)}
                              </time>
                            </div>
                            <p className="mt-1 text-xs text-muted line-clamp-2">{notification.message}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="hairline-t px-4 py-2">
            <Link
              href="/notifications"
              className="block text-center text-sm text-accent hover:underline"
              onClick={() => setIsOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}