"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSettings } from "./actions";

export function SettingsForm({
  eventName,
  eventCourse,
  eventClassName,
  maxUploadSizeMb,
  reservationTtlMinutes,
}: {
  eventName: string;
  eventCourse: string;
  eventClassName: string;
  maxUploadSizeMb: number;
  reservationTtlMinutes: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(eventName);
  const [course, setCourse] = useState(eventCourse);
  const [className, setClassName] = useState(eventClassName);
  const [maxUploadMb, setMaxUploadMb] = useState(String(maxUploadSizeMb));
  const [ttlMinutes, setTtlMinutes] = useState(String(reservationTtlMinutes));
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateSettings({
        eventInfo: { name, course, className },
        maxUploadSizeMb: Number(maxUploadMb),
        reservationTtlMinutes: Number(ttlMinutes),
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configurações salvas.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-lg gap-6">
      <div className="grid gap-3">
        <h2 className="label-tag">Evento</h2>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="event-name">
            Nome do evento
          </label>
          <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="event-course">
              Curso
            </label>
            <Input id="event-course" value={course} onChange={(e) => setCourse(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="event-class">
              Turma
            </label>
            <Input id="event-class" value={className} onChange={(e) => setClassName(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="receipt-divider grid gap-3 pt-6">
        <h2 className="label-tag">Rifas e uploads</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="ttl-minutes">
              Prazo de reserva (minutos)
            </label>
            <Input
              id="ttl-minutes"
              type="number"
              min={1}
              max={120}
              value={ttlMinutes}
              onChange={(e) => setTtlMinutes(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="max-upload">
              Tamanho máx. de arquivo (MB)
            </label>
            <Input
              id="max-upload"
              type="number"
              min={1}
              max={50}
              value={maxUploadMb}
              onChange={(e) => setMaxUploadMb(e.target.value)}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Formatos aceitos em comprovantes e documentos: JPG, PNG, WEBP e PDF (fixo).
        </p>
      </div>

      <div className="receipt-divider pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}
