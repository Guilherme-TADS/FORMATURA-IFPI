import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { ProfileForms } from "./profile-form";

export const instant = false;

export const metadata: Metadata = { title: "Meu Perfil" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  VISUALIZADOR: "Visualizador",
};

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Meu Perfil</h1>
            <Badge variant="outline" stamp>
              {ROLE_LABELS[profile.role] ?? profile.role}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Gerencie suas informações pessoais e credenciais de acesso.
          </p>
        </div>
        <div className="text-muted-foreground font-figures text-xs">
          Membro desde {new Date(profile.created_at).toLocaleDateString("pt-BR")}
        </div>
      </div>

      <ProfileForms
        initialFullName={profile.full_name}
        initialPhone={profile.phone ?? ""}
        email={user.email ?? ""}
      />
    </div>
  );
}
