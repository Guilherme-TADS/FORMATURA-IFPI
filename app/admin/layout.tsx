import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AdminShell } from "./_components/admin-shell";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  // The proxy already blocks unauthenticated/inactive users from reaching
  // here — this is a defensive second check, not the primary guard.
  if (!profile || !profile.active) {
    redirect("/login");
  }

  const supabase = await createClient();
  const [{ data: unapprovedSales }, { data: approvedLogs }] = await Promise.all([
    supabase
      .from("raffle_sales")
      .select("id")
      .is("seller_id", null)
      .neq("status", "CANCELLED"),
    supabase
      .from("audit_logs")
      .select("entity_id")
      .eq("entity_type", "raffle_sale")
      .eq("action", "SALE_APPROVED"),
  ]);

  const approvedIds = new Set(approvedLogs?.map((l) => l.entity_id));
  const pendingSalesCount = (unapprovedSales ?? []).filter(
    (s) => !approvedIds.has(s.id),
  ).length;

  return (
    <AdminShell
      fullName={profile.full_name}
      role={profile.role}
      pendingSalesCount={pendingSalesCount ?? 0}
    >
      {children}
    </AdminShell>
  );
}
