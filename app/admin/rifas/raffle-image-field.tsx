"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Loader2,
  Link2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RaffleImageFieldProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function RaffleImageField({
  value = "",
  onChange,
  disabled = false,
}: RaffleImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imgError, setImgError] = useState(false);

  async function handleFileUpload(file: File) {
    if (!file) return;

    const validMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!validMimes.includes(file.type)) {
      toast.error("Formato inválido. Por favor, envie uma foto em JPG, PNG ou WebP.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("A imagem selecionada excede o tamanho máximo de 8MB.");
      return;
    }

    setIsUploading(true);
    setImgError(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/uploads/imagem-rifa", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível enviar a imagem.");
      }

      if (data.url) {
        onChange(data.url);
        toast.success("Foto da rifa enviada com sucesso!");
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao fazer upload da imagem. Tente novamente.",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragover" || e.type === "dragenter") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }

  function handleRemove() {
    onChange("");
    setImgError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {/* When an image is present, show preview */}
      {value && value.trim().length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card p-3 shadow-xs transition-all">
          <div className="relative aspect-video max-h-56 w-full overflow-hidden rounded-lg bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Pré-visualização da rifa"
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
              onLoad={() => setImgError(false)}
            />

            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-xs">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="mt-2 text-xs font-medium text-foreground">
                  Enviando nova imagem...
                </span>
              </div>
            )}
          </div>

          {imgError && (
            <div className="mt-2 rounded-lg bg-destructive/10 p-2 text-center text-xs text-destructive">
              Não foi possível carregar o preview da imagem desta URL. Verifique o link ou envie outro arquivo.
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploading}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Substituir foto
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || isUploading}
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            </div>

            {value.startsWith("http") && (
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir original
              </a>
            )}
          </div>

          <div className="mt-2 border-t pt-2">
            <button
              type="button"
              onClick={() => setShowUrlInput((prev) => !prev)}
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs"
            >
              <Link2 className="h-3 w-3" />
              {showUrlInput ? "Ocultar link da imagem" : "Editar link manualmente"}
            </button>

            {showUrlInput && (
              <div className="mt-2">
                <Input
                  value={value}
                  onChange={(e) => {
                    onChange(e.target.value);
                    setImgError(false);
                  }}
                  placeholder="https://..."
                  disabled={disabled || isUploading}
                  className="text-xs"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty state: Dropzone and file selector */
        <div className="space-y-2">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => {
              if (!disabled && !isUploading) {
                fileInputRef.current?.click();
              }
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
              dragActive
                ? "border-primary bg-primary/5 scale-[1.005]"
                : "border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/35"
            } ${disabled || isUploading ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center py-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Enviando foto da rifa...
                </p>
                <p className="text-muted-foreground text-xs">
                  Por favor, aguarde o upload terminar.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full mb-3 shadow-xs">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Clique para selecionar uma imagem do seu aparelho
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  ou arraste e solte o arquivo aqui (JPG, PNG ou WebP até 8MB)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 pointer-events-none"
                >
                  <ImageIcon className="mr-1.5 h-4 w-4" />
                  Escolher arquivo
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowUrlInput((prev) => !prev)}
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 font-medium transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              {showUrlInput ? "Ocultar campo de link" : "Ou colar um link da internet"}
            </button>
          </div>

          {showUrlInput && (
            <div className="pt-1">
              <Input
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  setImgError(false);
                }}
                placeholder="https://exemplo.com/imagem.jpg"
                disabled={disabled || isUploading}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Insira o link público direto para a imagem caso já esteja hospedada online.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
