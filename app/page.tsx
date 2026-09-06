import Link from "next/link";
import { getEventInfo } from "@/lib/settings";
import { LinkButton } from "@/components/ui/link-button";

export default async function Home() {
  const event = await getEventInfo();
  const subtitle = [event.course, event.className].filter(Boolean).join(" · ");

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="bg-card ring-foreground/8 relative w-full max-w-sm rounded-lg p-8 text-center shadow-[0_1px_2px_oklch(0.3_0.02_85_/_0.08),0_20px_40px_-20px_oklch(0.3_0.02_85_/_0.3)] ring-1">
        <span className="stamp text-confirmed border-confirmed mx-auto text-xs">
          Comissão oficial
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-balance">
          {event.name}
        </h1>
        {subtitle ? (
          <p className="label-tag mt-1.5">{subtitle}</p>
        ) : null}

        <div className="receipt-divider mt-6 pt-6">
          <p className="text-muted-foreground text-sm text-balance">
            Escolha seu número e ajude a turma a chegar até a formatura.
          </p>
          <LinkButton href="/rifas" size="lg" className="mt-5 w-full">
            Ver rifas ativas
          </LinkButton>
        </div>

        {/* Torn ticket edge — the receipt world's recurring seam. */}
        <div
          aria-hidden
          className="border-border pointer-events-none absolute inset-x-8 -bottom-3 border-t border-dashed"
        />
      </div>

      <p className="text-muted-foreground mt-8 text-xs">
        Já tem uma conta na comissão?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Entrar no painel
        </Link>
      </p>
    </main>
  );
}
