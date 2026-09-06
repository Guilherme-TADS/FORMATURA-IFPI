"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/types/database";
import { toggleUserActive, updateUserRole } from "./actions";

type Role = Database["public"]["Enums"]["user_role"];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  VISUALIZADOR: "Visualizador",
};

export function UserRow({
  id,
  fullName,
  email,
  role,
  active,
  createdAt,
  isSelf,
}: {
  id: string;
  fullName: string;
  email: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localRole, setLocalRole] = useState(role);

  function handleRoleChange(newRole: Role) {
    setLocalRole(newRole);
    startTransition(async () => {
      const result = await updateUserRole(id, newRole);
      if (result?.error) {
        toast.error(result.error);
        setLocalRole(role);
        return;
      }
      toast.success("Papel atualizado.");
      router.refresh();
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await toggleUserActive(id, !active);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(active ? "Usuário desativado." : "Usuário reativado.");
      router.refresh();
    });
  }

  return (
    <tr className="border-border border-b border-dashed last:border-0">
      <td className="py-2.5 pr-4">
        <div className="font-medium">
          {fullName}
          {isSelf ? <span className="text-muted-foreground text-xs"> (você)</span> : null}
        </div>
        <div className="text-muted-foreground text-xs">{email ?? "—"}</div>
      </td>
      <td className="py-2.5 pr-4">
        {isSelf ? (
          ROLE_LABELS[role]
        ) : (
          <select
            value={localRole}
            disabled={pending}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3"
          >
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="py-2.5 pr-4">
        <Badge variant={active ? "confirmed" : "void"} stamp>
          {active ? "Ativo" : "Desativado"}
        </Badge>
      </td>
      <td className="font-figures py-2.5 pr-4">
        {new Date(createdAt).toLocaleDateString("pt-BR")}
      </td>
      <td className="py-2.5 pr-4">
        {isSelf ? null : (
          <Button
            variant={active ? "destructive" : "outline"}
            size="sm"
            disabled={pending}
            onClick={handleToggleActive}
          >
            {active ? "Desativar" : "Reativar"}
          </Button>
        )}
      </td>
    </tr>
  );
}
