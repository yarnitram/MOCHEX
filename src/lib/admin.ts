import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Strict platform administrator email
const STRICT_ADMIN_EMAIL = "support@mochex.com";

export function getAdminList(): { usernames: string[]; emails: string[] } {
  const envAdmins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const emails = Array.from(new Set([STRICT_ADMIN_EMAIL, ...envAdmins]));
  return {
    usernames: [],
    emails,
  };
}

/**
 * Determine if a user has Administrator privileges.
 * Strictly checks that the user's authenticated email is support@mochex.com.
 */
export function isUserAdmin(
  user: User | null,
  userSettings?: { username?: string | null; is_admin?: boolean | null } | null
): boolean {
  if (!user || !user.email) return false;

  const email = user.email.trim().toLowerCase();
  const { emails } = getAdminList();

  return emails.includes(email);
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
