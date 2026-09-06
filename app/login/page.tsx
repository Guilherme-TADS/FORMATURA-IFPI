import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/admin/dashboard");
  }

  return (
    <main className="bg-secondary/40 flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="stamp text-primary border-primary text-xs">CF</span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            Comissão de Formatura
          </h1>
          <p className="text-muted-foreground text-sm">
            Entre com sua conta para acessar o painel.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
