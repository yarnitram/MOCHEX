import { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { CryptoBubblesView } from "@/components/admin/crypto-bubbles-view";

export const metadata: Metadata = {
  title: "Market Bubbles | Admin MOCHEX",
  description: "Interactive 2D physics market bubbles for emerging and non-major crypto tokens.",
};

export default async function AdminBubblesPage() {
  const { user } = await requireAdmin(true);

  if (!user) {
    return null;
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      <CryptoBubblesView />
    </div>
  );
}
