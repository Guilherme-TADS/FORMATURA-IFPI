"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Database } from "@/types/database";
import { inviteUser } from "./actions";

type Role = Database["public"]["Enums"]["user_role"];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  VISUALIZADOR: "Visualizador",
};

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("VENDEDOR");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteUser(email, fullName, role);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Convite enviado por e-mail.");
      setEmail("");
      setFullName("");
      setRole("VENDEDOR");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto_auto]">
      <Input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Nome completo"
      />
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-mail"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="border-input h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
      >
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Convidar"}
      </Button>
    </form>
  );
}
