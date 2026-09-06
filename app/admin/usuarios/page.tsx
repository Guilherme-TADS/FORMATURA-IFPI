import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/session";
import { InviteUserForm } from "./invite-user-form";
import { UserRow } from "./user-row";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // profiles has no email column (that lives in auth.users) — cross-reference
  // via the Admin API. listUsers pages at 50 by default; perPage covers this
  // app's realistic scale (a graduation committee, not a company directory).
  // Independent queries, run in parallel instead of one after the other.
  const [{ data: profiles }, { data: authUsers }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, active, created_at")
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Usuários</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Convide novos membros da comissão e gerencie papéis e acesso.
      </p>

      <div className="mb-8">
        <InviteUserForm />
      </div>

      {!profiles || profiles.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum usuário cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-border border-b border-dashed text-left">
                <th className="label-tag py-2 pr-4">Usuário</th>
                <th className="label-tag py-2 pr-4">Papel</th>
                <th className="label-tag py-2 pr-4">Status</th>
                <th className="label-tag py-2 pr-4">Desde</th>
                <th className="label-tag py-2 pr-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <UserRow
                  key={p.id}
                  id={p.id}
                  fullName={p.full_name}
                  email={emailById.get(p.id) ?? null}
                  role={p.role}
                  active={p.active}
                  createdAt={p.created_at}
                  isSelf={p.id === profile.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
