import type { Metadata } from "next";
import Link from "next/link";
import { TicketLookupClient } from "./ticket-lookup-client";

export const metadata: Metadata = {
  title: "Consultar Meus Bilhetes",
  description:
    "Consulte os números das rifas que você comprou e acompanhe a conferência do seu comprovante.",
};

export default function MeusBilhetesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 py-8 sm:p-8">
      <div className="mb-6">
        <Link
          href="/rifas"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          ‹ Voltar para as rifas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Consultar Meus Bilhetes
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Acompanhe o status do seu pagamento e confira todos os números da sua cartela.
        </p>
      </div>

      <TicketLookupClient />
    </main>
  );
}
