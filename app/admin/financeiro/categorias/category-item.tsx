"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteCategory,
  toggleCategoryActive,
  updateCategory,
} from "../actions";

export function CategoryItem({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  function handleSaveRename() {
    const trimmed = editName.trim();
    if (trimmed.length < 2) {
      toast.error("Nome da categoria muito curto.");
      return;
    }
    if (trimmed === name) {
      setIsEditing(false);
      return;
    }

    startTransition(async () => {
      try {
        await updateCategory(id, trimmed);
        toast.success(`Categoria renomeada para "${trimmed}".`);
        setIsEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao renomear categoria.",
        );
      }
    });
  }

  function handleToggle() {
    startTransition(async () => {
      try {
        await toggleCategoryActive(id, !active);
        toast.success(
          active
            ? `Categoria "${name}" desativada.`
            : `Categoria "${name}" reativada.`,
        );
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Erro ao alterar status da categoria.",
        );
      }
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir a categoria "${name}"?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteCategory(id);
        toast.success(`Categoria "${name}" excluída.`);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao excluir categoria.",
        );
      }
    });
  }

  if (isEditing) {
    return (
      <li className="border-primary bg-card flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm shadow-xs">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          autoFocus
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveRename();
            if (e.key === "Escape") {
              setEditName(name);
              setIsEditing(false);
            }
          }}
          className="border-input h-6 w-32 rounded border bg-background px-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          onClick={handleSaveRename}
          title="Salvar novo nome"
          className="hover:bg-primary/10 hover:text-primary"
        >
          <Check className="size-3 text-primary" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          onClick={() => {
            setEditName(name);
            setIsEditing(false);
          }}
          title="Cancelar edição"
        >
          <X className="size-3 text-muted-foreground" />
        </Button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group border-border flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm transition-colors",
        active
          ? "bg-secondary/60 text-foreground"
          : "bg-muted/40 text-muted-foreground opacity-75",
      )}
    >
      <span className={cn(active ? "" : "line-through")}>{name}</span>
      {!active ? (
        <span className="bg-muted text-muted-foreground rounded px-1 text-[10px] uppercase font-semibold tracking-wider">
          Inativa
        </span>
      ) : null}

      <div className="ml-1 flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          onClick={() => {
            setEditName(name);
            setIsEditing(true);
          }}
          title="Renomear categoria"
          aria-label="Renomear categoria"
        >
          <Pencil className="size-3 text-muted-foreground hover:text-foreground" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          onClick={handleToggle}
          title={active ? "Desativar categoria" : "Reativar categoria"}
          aria-label={active ? "Desativar categoria" : "Reativar categoria"}
        >
          {active ? (
            <EyeOff className="size-3 text-muted-foreground hover:text-foreground" />
          ) : (
            <Eye className="size-3 text-muted-foreground hover:text-foreground" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          onClick={handleDelete}
          title="Excluir categoria"
          aria-label="Excluir categoria"
          className="hover:bg-destructive/15 hover:text-destructive"
        >
          <Trash2 className="size-3 text-muted-foreground group-hover:text-destructive transition-colors" />
        </Button>
      </div>
    </li>
  );
}
