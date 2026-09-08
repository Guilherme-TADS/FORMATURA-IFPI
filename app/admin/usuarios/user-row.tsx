"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Database } from "@/types/database";
import {
  toggleUserActive,
  updateUserRole,
  deleteUser,
  updateUserProfile,
} from "./actions";

type Role = Database["public"]["Enums"]["user_role"];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
  VISUALIZADOR: "Visualizador",
};

export function UserRow({
  id,
  fullName,
  phone,
  email,
  role,
  active,
  createdAt,
  isSelf,
}: {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [localRole, setLocalRole] = useState(role);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(fullName);
  const [editPhone, setEditPhone] = useState(phone ?? "");

  function handleSaveProfile() {
    startTransition(async () => {
      const result = await updateUserProfile(id, editName, editPhone);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Dados do usuário atualizados.");
      setIsEditing(false);
      router.refresh();
    });
  }

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
    if (
      active &&
      !window.confirm(
        `Tem certeza que deseja desativar o acesso de "${fullName}"?\n\nO usuário não conseguirá fazer login no sistema até ser reativado.`,
      )
    ) {
      return;
    }

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

  function handleDelete() {
    const confirmation = window.confirm(
      `Tem certeza que deseja excluir permanentemente o usuário "${fullName}"?\n\nEsta ação remove a conta e o acesso do usuário. Usuários com histórico de vendas ou movimentações associadas não podem ser excluídos.`,
    );
    if (!confirmation) return;

    startTransition(async () => {
      const result = await deleteUser(id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuário excluído com sucesso.");
      router.refresh();
    });
  }

  return (
    <tr className="border-border border-b border-dashed last:border-0">
      <td className="py-2.5 pr-4">
        {isEditing ? (
          <div className="flex flex-col gap-1.5 py-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome completo"
              disabled={pending}
              className="h-7 text-xs"
            />
            <Input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="Telefone / Celular"
              disabled={pending}
              className="h-7 text-xs"
            />
            <div className="flex items-center gap-1 mt-0.5">
              <Button
                type="button"
                size="xs"
                disabled={pending}
                onClick={handleSaveProfile}
                className="h-6 px-2 text-xs"
              >
                <Check className="size-3 mr-1" /> Salvar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() => {
                  setEditName(fullName);
                  setEditPhone(phone ?? "");
                  setIsEditing(false);
                }}
                className="h-6 px-2 text-xs"
              >
                <X className="size-3 mr-1" /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-medium">
              {fullName}
              {isSelf ? (
                <span className="text-muted-foreground text-xs"> (você)</span>
              ) : null}
            </div>
            <div className="text-muted-foreground text-xs">
              {email ?? "—"}
              {phone ? ` · ${phone}` : ""}
            </div>
          </div>
        )}
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
      <td suppressHydrationWarning className="font-figures py-2.5 pr-4">
        {new Date(createdAt).toLocaleDateString("pt-BR")}
      </td>
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1.5">
          {!isEditing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setIsEditing(true)}
              title="Editar dados cadastrais"
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : null}

          {isSelf ? null : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={handleToggleActive}
              >
                {active ? "Desativar" : "Reativar"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={handleDelete}
                title="Excluir usuário permanentemente"
              >
                Excluir
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
