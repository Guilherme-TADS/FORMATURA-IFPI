"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMyProfile, updateMyPassword } from "./actions";

export function ProfileForms({
  initialFullName,
  initialPhone,
  email,
}: {
  initialFullName: string;
  initialPhone: string;
  email: string;
}) {
  const router = useRouter();
  const [profilePending, startProfileTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();

  // Profile state
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    startProfileTransition(async () => {
      const res = await updateMyProfile(fullName, phone);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Perfil atualizado com sucesso.");
      router.refresh();
    });
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação de senha não confere com a nova senha.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    startPasswordTransition(async () => {
      const res = await updateMyPassword(currentPassword, newPassword);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Dados Cadastrais */}
      <div className="border-border bg-card rounded-lg border p-5">
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <User className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Dados Cadastrais</h2>
        </div>

        <form onSubmit={handleProfileSubmit} className="grid gap-4">
          <div>
            <label className="text-xs font-medium">E-mail (não editável)</label>
            <Input
              value={email}
              disabled
              className="bg-muted/50 mt-1 cursor-not-allowed text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Nome Completo *</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={profilePending}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Telefone / Celular</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(86) 99999-9999"
              disabled={profilePending}
              className="mt-1 text-sm"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" size="sm" disabled={profilePending}>
              {profilePending ? "Salvando…" : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </div>

      {/* Alterar Senha */}
      <div className="border-border bg-card rounded-lg border p-5">
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <Lock className="size-4 text-primary" />
          <h2 className="text-base font-semibold">Segurança & Senha</h2>
        </div>

        <form onSubmit={handlePasswordSubmit} className="grid gap-4">
          <div>
            <label className="text-xs font-medium">Senha Atual *</label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              disabled={passwordPending}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Nova Senha * (mínimo 6 caracteres)</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              disabled={passwordPending}
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium">Confirmar Nova Senha *</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              disabled={passwordPending}
              className="mt-1 text-sm"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={passwordPending}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-3.5" />
              {passwordPending ? "Alterando…" : "Atualizar Senha"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
