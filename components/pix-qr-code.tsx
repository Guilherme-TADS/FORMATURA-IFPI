"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToBRL } from "@/lib/money";

export function PixQrCode({
  code,
  amountCents,
  pixKey,
}: {
  code: string;
  amountCents: number;
  pixKey?: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) {
      setQrDataUrl(null);
      return;
    }

    let isMounted = true;
    QRCode.toDataURL(code, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch(() => {
        if (isMounted) setQrDataUrl(null);
      });

    return () => {
      isMounted = false;
    };
  }, [code]);

  const textToCopy = code || pixKey || "";

  function handleCopy() {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success(code ? "Código Pix Copia e Cola copiado!" : "Chave Pix copiada!");
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="border-border bg-secondary/60 grid gap-4 rounded-xl border border-dashed p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <p className="text-sm font-semibold">Pagamento via PIX</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Pague pelo QR Code ou com o código Copia e Cola
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">Valor exato:</span>
          <p className="font-figures text-base font-bold text-foreground">
            {centsToBRL(amountCents)}
          </p>
        </div>
      </div>

      {/* Box do QR Code Visual */}
      <div className="flex flex-col items-center justify-center py-2 text-center">
        <div className="bg-white p-2.5 rounded-xl shadow-sm ring-1 ring-black/10 flex items-center justify-center w-[200px] h-[200px]">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR Code Pix"
              width={180}
              height={180}
              className="w-[180px] h-[180px] object-contain select-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Gerando QR Code…</span>
            </div>
          )}
        </div>
        <p className="text-muted-foreground text-xs mt-2.5 max-w-xs">
          Aponte a câmera do seu celular no app do banco para pagar o valor de{" "}
          <strong className="text-foreground">{centsToBRL(amountCents)}</strong>.
        </p>
      </div>

      {/* Pix Copia e Cola */}
      <div className="grid gap-1.5 border-t border-border/60 pt-3">
        <label className="text-xs font-medium text-muted-foreground">
          Ou copie o código Pix abaixo (Pix Copia e Cola):
        </label>
        {textToCopy ? (
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={textToCopy}
              className="font-mono text-xs bg-background select-all h-9"
            />
            <Button
              type="button"
              variant={copied ? "default" : "outline"}
              size="sm"
              onClick={handleCopy}
              className="shrink-0 h-9 px-3"
            >
              {copied ? "Copiado! ✓" : "Copiar Código Pix"}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            Chave Pix sendo informada pela comissão.
          </p>
        )}
      </div>
    </div>
  );
}
