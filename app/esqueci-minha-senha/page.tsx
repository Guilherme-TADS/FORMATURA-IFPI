import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Recuperar acesso
          </h1>
          <p className="text-muted-foreground text-sm">
            Informe seu e-mail para receber um link de redefinição de senha.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
