import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getAllSettings } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "ADMIN") {
    redirect("/admin/dashboard");
  }

  const { eventInfo, uploadLimits, reservationTtlMinutes } = await getAllSettings();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Valores usados pelo sistema todo — mudanças aqui têm efeito imediato, sem precisar de deploy.
      </p>

      <SettingsForm
        eventName={eventInfo.name}
        eventCourse={eventInfo.course}
        eventClassName={eventInfo.className}
        maxUploadSizeMb={Math.round(uploadLimits.maxSizeBytes / 1024 / 1024)}
        reservationTtlMinutes={reservationTtlMinutes}
      />
    </div>
  );
}
