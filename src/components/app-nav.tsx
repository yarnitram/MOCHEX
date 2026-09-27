"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/ui/notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TipModal } from "@/components/ui/tip-modal";

const LINKS = [
  { href: "/watchlist", label: "Watchlist", icon: "🪙" },
  { href: "/trades", label: "Trades", icon: "⚡" },
  { href: "/journal", label: "Journal", icon: "📖" },
  { href: "/shares", label: "Shares", icon: "🌐" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status
  useEffect(() => {
    let mounted = true;
    async function checkAdminStatus() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const email = (user.email || "").toLowerCase();
        const usernameMeta = (user.user_metadata?.username || "").toLowerCase();

        // Fast match on common root username/email
        if (email.includes("ymatt") || usernameMeta === "ymatt") {
          if (mounted) setIsAdmin(true);
          return;
        }

        // Check user_settings table
        const { data } = await supabase
          .from("user_settings")
          .select("is_admin, username")
          .eq("user_id", user.id)
          .maybeSingle();

        if (mounted && (data?.is_admin === true || data?.username?.toLowerCase() === "ymatt")) {
          setIsAdmin(true);
        }
      } catch {
        // ignore
      }
    }
    checkAdminStatus();
    return () => {
      mounted = false;
    };
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  async function handleLogout() {
    setMobileMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="hairline-b bg-paper/90 sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand & Desktop Nav */}
        <div className="flex items-center gap-5 min-w-0">
          <Link
            href="/watchlist"
            className="brand-gradient text-2xl shrink-0 font-extrabold tracking-tight"
            aria-label="MOCHEX home"
          >
            MOCHEX
          </Link>

          {/* Desktop Navigation Links */}
          <nav aria-label="Primary navigation" className="hidden sm:flex items-center gap-1 h-full">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 text-sm whitespace-nowrap rounded-lg transition-colors ${
                  isActive(l.href)
                    ? "text-accent bg-accent/15 font-semibold"
                    : "text-muted hover:text-text hover:bg-panel-soft"
                }`}
              >
                {l.label}
              </Link>
            ))}

            {isAdmin && (
              <Link
                href="/admin"
                className={`px-2.5 py-1 text-xs font-semibold whitespace-nowrap rounded-lg transition-all flex items-center gap-1.5 border ml-1 ${
                  isActive("/admin")
                    ? "text-amber-400 bg-amber-500/15 border-amber-500/40 shadow-sm shadow-amber-500/10 font-bold"
                    : "text-amber-400/90 hover:text-amber-300 hover:bg-amber-400/10 border-amber-500/30"
                }`}
              >
                <span className="text-sm">🛡️</span>
                <span>Admin</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 h-full">
          <NotificationBell />

          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className={`p-2 text-muted hover:text-text transition-colors rounded-lg hover:bg-panel-soft ${
              isActive("/settings") ? "text-accent bg-accent/15 font-semibold" : ""
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>

          <ThemeToggle />

          {/* Tip / Support Server Hosting */}
          <button
            type="button"
            onClick={() => setTipModalOpen(true)}
            title="Support Server Hosting (Tip Jar)"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-muted hover:text-accent hover:bg-panel-soft transition-colors cursor-pointer border border-line"
          >
            <span>☕</span>
            <span className="hidden lg:inline">Tip</span>
          </button>

          {/* Desktop Sign Out */}
          <button
            type="button"
            onClick={handleLogout}
            className="hidden sm:block text-sm text-muted hover:text-loss cursor-pointer whitespace-nowrap ml-1.5"
          >
            Sign out
          </button>

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="sm:hidden p-2 rounded-lg text-muted hover:text-text hover:bg-panel-soft transition-colors cursor-pointer ml-1"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-x-0 top-16 bottom-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 flex flex-col justify-start">
          <div className="bg-panel border-b border-line p-5 shadow-2xl flex flex-col gap-3">
            <p className="eyebrow text-muted text-[10px] tracking-wider uppercase mb-1">Navigation</p>
            <div className="grid grid-cols-2 gap-2">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive(l.href)
                      ? "bg-accent/15 text-accent border border-accent/30 font-semibold"
                      : "bg-panel-soft/60 text-text hover:bg-panel-soft border border-line"
                  }`}
                >
                  <span className="text-base">{l.icon}</span>
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>

            <div className="hairline-t pt-3 mt-1 flex flex-col gap-2">
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                    isActive("/admin")
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10"
                      : "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border-amber-500/30"
                  }`}
                >
                  <span className="text-base">🛡️</span>
                  <span>Admin Dashboard</span>
                </Link>
              )}

              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive("/settings")
                    ? "bg-accent/15 text-accent border border-accent/30 font-semibold"
                    : "bg-panel-soft/40 text-muted hover:text-text border border-line"
                }`}
              >
                <span>⚙️</span>
                <span>Preferences & Settings</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTipModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-text hover:bg-panel-soft bg-panel-soft/40 border border-line transition-colors cursor-pointer text-left"
              >
                <span>☕</span>
                <span>Support MOCHEX Hosting</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-loss hover:bg-loss/15 bg-loss/5 border border-loss/20 transition-colors cursor-pointer text-left"
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Tap-to-dismiss background */}
          <div
            className="flex-1"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Crypto Tip Jar & Server Support Modal */}
      <TipModal isOpen={tipModalOpen} onClose={() => setTipModalOpen(false)} />
    </header>
  );
}