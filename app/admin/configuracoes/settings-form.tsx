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
  pixKey = "",
  pixMerchantName = "",
  pixMerchantCity = "",
  mercadoPagoEnabled = false,
  mercadoPagoAccessToken = "",
  mercadoPagoPublicKey = "",
}: {
  eventName: string;
  eventCourse: string;
  eventClassName: string;
  maxUploadSizeMb: number;
  reservationTtlMinutes: number;
  pixKey?: string;
  pixMerchantName?: string;
  pixMerchantCity?: string;
  mercadoPagoEnabled?: boolean;
  mercadoPagoAccessToken?: string;
  mercadoPagoPublicKey?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(eventName);
  const [course, setCourse] = useState(eventCourse);
  const [className, setClassName] = useState(eventClassName);
  const [maxUploadMb, setMaxUploadMb] = useState(String(maxUploadSizeMb));
  const [ttlMinutes, setTtlMinutes] = useState(String(reservationTtlMinutes));
  const [key, setKey] = useState(pixKey);
  const [merchantName, setMerchantName] = useState(pixMerchantName || "Comissao Formatura");
  const [merchantCity, setMerchantCity] = useState(pixMerchantCity || "Teresina");
  const [mpEnabled, setMpEnabled] = useState(mercadoPagoEnabled);
  const [mpToken, setMpToken] = useState(mercadoPagoAccessToken);
  const [mpPublicKey, setMpPublicKey] = useState(mercadoPagoPublicKey);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateSettings({
        eventInfo: { name, course, className },
        maxUploadSizeMb: Number(maxUploadMb),
        reservationTtlMinutes: Number(ttlMinutes),
        pixInfo: {
          key,
          merchantName,
          merchantCity,
        },
        mercadoPagoConfig: {
          enabled: mpEnabled,
          accessToken: mpToken,
          publicKey: mpPublicKey,
        },
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
            <p className="text-muted-foreground text-xs">
              Tempo para o comprador pagar via Pix e anexar o comprovante antes dos números expirarem e voltarem a ficar disponíveis.
            </p>
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

      <div className="receipt-divider grid gap-3 pt-6">
        <h2 className="label-tag">Chave PIX e Pagamento</h2>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="pix-key">
            Chave PIX (E-mail, CPF/CNPJ, Telefone ou Chave Aleatória)
          </label>
          <Input
            id="pix-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ex: comissao@email.com ou 12345678900"
          />
          <p className="text-muted-foreground text-xs">
            Utilizada para gerar automaticamente o código Pix Copia e Cola no checkout das rifas.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="pix-merchant-name">
              Nome do recebedor (máx 25 carac.)
            </label>
            <Input
              id="pix-merchant-name"
              maxLength={25}
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="pix-merchant-city">
              Cidade do recebedor (máx 15 carac.)
            </label>
            <Input
              id="pix-merchant-city"
              maxLength={15}
              value={merchantCity}
              onChange={(e) => setMerchantCity(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="receipt-divider grid gap-3 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="label-tag">PIX Automático (Mercado Pago)</h2>
            <p className="text-muted-foreground text-xs mt-0.5">
              Gera QR Code dinâmico com aprovação em segundos sem envio de comprovante. A Chave PIX manual continuará disponível como opção alternativa.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={mpEnabled}
              onChange={(e) => setMpEnabled(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-secondary peer-checked:bg-confirmed peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
          </label>
        </div>

        {mpEnabled && (
          <div className="grid gap-3 pt-2">
            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor="mp-access-token">
                Access Token de Produção ou Teste (Bearer Token)
              </label>
              <Input
                id="mp-access-token"
                type="password"
                value={mpToken}
                onChange={(e) => setMpToken(e.target.value)}
                placeholder="APP_USR-..."
              />
              <p className="text-muted-foreground text-xs">
                Obtenha no painel do Mercado Pago Developers (Suas integrações &gt; Credenciais).
              </p>
            </div>

            <div className="grid gap-1">
              <label className="text-sm font-medium" htmlFor="mp-public-key">
                Public Key (opcional)
              </label>
              <Input
                id="mp-public-key"
                value={mpPublicKey}
                onChange={(e) => setMpPublicKey(e.target.value)}
                placeholder="APP_USR-..."
              />
            </div>

            <div className="border-border bg-secondary/50 rounded-lg border p-3 text-xs">
              <p className="font-semibold mb-1">URL de Webhook para cadastrar no Mercado Pago:</p>
              <code className="bg-background border-border block rounded border px-2 py-1 text-[11px] font-mono select-all">
                {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/mercadopago` : "/api/webhooks/mercadopago"}
              </code>
              <p className="text-muted-foreground mt-1 text-[11px]">
                No painel do Mercado Pago, configure o Webhook para eventos de <strong>Pagamentos (payments)</strong> apontando para a URL acima (em produção). Em desenvolvimento local (localhost), use ferramentas como ngrok para testes.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="receipt-divider pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}
