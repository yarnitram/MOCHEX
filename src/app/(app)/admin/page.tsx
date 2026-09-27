import { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";

export const metadata: Metadata = {
  title: "Admin Dashboard | MOCHEX",
  description: "Centralized system telemetry, trader directory, webhook lab, and cloud storage management.",
};

export default async function AdminPage() {
  const { user } = await requireAdmin(true);

  if (!user) {
    return null;
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      <AdminDashboardClient currentUserId={user.id} />
    </div>
  );
}
