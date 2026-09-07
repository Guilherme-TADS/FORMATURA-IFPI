"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  requestPasswordReset,
  type RequestResetState,
} from "@/lib/auth/actions";

const initialState: RequestResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.success) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm">
          <p>
            Se este e-mail estiver cadastrado, você receberá um link para
            redefinir sua senha em instantes.
          </p>
          <div className="mt-4">
            <Link
              href="/login"
              className="text-primary hover:underline text-xs font-medium inline-flex items-center gap-1"
            >
              ‹ Voltar para o login
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          {state.error ? (
            <p role="alert" className="text-destructive text-sm">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Enviando..." : "Enviar link"}
          </Button>
          <div className="text-center mt-1">
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
            >
              Voltar para o login
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
