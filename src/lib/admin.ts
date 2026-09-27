import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Default admin usernames and emails
const DEFAULT_ADMINS = ["ymatt", "support@mochex.com", "support"];

export function getAdminList(): { usernames: string[]; emails: string[] } {
  const envAdmins = (process.env.ADMIN_USERS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allAdmins = Array.from(new Set([...DEFAULT_ADMINS, ...envAdmins]));
  return {
    usernames: allAdmins.filter((s) => !s.includes("@")),
    emails: allAdmins.filter((s) => s.includes("@")),
  };
}

/**
 * Determine if a user has Administrator privileges.
 */
export function isUserAdmin(
  user: User | null,
  userSettings?: { username?: string | null; is_admin?: boolean | null } | null
): boolean {
  if (!user) return false;

  const { usernames, emails } = getAdminList();

  // 1. Explicit database role flag
  if (userSettings?.is_admin === true) {
    return true;
  }

  // 2. Username match
  if (userSettings?.username && usernames.includes(userSettings.username.toLowerCase())) {
    return true;
  }

  // 3. Email match
  if (user.email && (emails.includes(user.email.toLowerCase()) || usernames.includes(user.email.toLowerCase()))) {
    return true;
  }

  return false;
}

/**
 * Server-side guard for Admin pages and API routes.
 * Throws or redirects if the current session is not an authorized administrator.
 */
export async function requireAdmin(redirectOnFail = true) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (redirectOnFail) {
      redirect("/login?next=/admin");
    }
    return { user: null, isAdmin: false, supabase };
  }

  // Fetch user settings to check username and is_admin
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("username, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = isUserAdmin(user, userSettings);

  if (!isAdmin && redirectOnFail) {
    redirect("/watchlist?error=unauthorized_admin");
  }

  return { user, userSettings, isAdmin, supabase };
}
