"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnnouncementData } from "@/app/api/admin/announcement/route";

export function BroadcastBanner() {
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    fetch("/api/admin/announcement")
      .then((res) => res.json())
      .then((data) => {
        if (data?.announcement?.is_active) {
          const annId = data.announcement.id || data.announcement.title;
          const isDismissed = sessionStorage.getItem(`mochex_dismissed_banner_${annId}`);
          if (!isDismissed) {
            setAnnouncement(data.announcement);
            setDismissed(false);
          }
        }
      })
      .catch(() => {});
  }, []);

  if (dismissed || !announcement || !announcement.is_active) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    const annId = announcement.id || announcement.title;
    try {
      sessionStorage.setItem(`mochex_dismissed_banner_${annId}`, "true");
    } catch {}
  };

  // Color themes by announcement type
  const themeStyles = {
    info: "bg-blue-500/10 border-b border-blue-500/20 text-blue-400",
    warning: "bg-amber-500/10 border-b border-amber-500/20 text-amber-400",
    success: "bg-gain/10 border-b border-gain/20 text-gain",
    announcement: "bg-gradient-to-r from-accent/20 via-purple-600/15 to-accent/20 border-b border-accent/30 text-accent",
  }[announcement.type] || "bg-accent/15 border-b border-accent/25 text-accent";

  const icon = {
    info: "ℹ️",
    warning: "⚠️",
    success: "✓",
    announcement: "📢",
  }[announcement.type] || "📢";

  return (
    <div className={`w-full px-4 py-2 text-xs flex items-center justify-between gap-3 backdrop-blur-sm z-50 animate-in fade-in duration-200 ${themeStyles}`}>
      <div className="flex items-center gap-2.5 mx-auto text-center flex-wrap justify-center">
        <span className="text-sm shrink-0">{icon}</span>
        <span className="font-bold text-text">{announcement.title}:</span>
        <span className="text-text/90">{announcement.message}</span>
        {announcement.link_url && (
          <Link
            href={announcement.link_url}
            className="underline underline-offset-2 font-semibold hover:opacity-80 transition-opacity ml-1"
          >
            {announcement.link_text || "Learn More →"}
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="p-1 text-muted hover:text-text rounded-md hover:bg-panel-soft/60 transition-colors shrink-0 cursor-pointer"
        title="Dismiss announcement"
        aria-label="Dismiss announcement"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
