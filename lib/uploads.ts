export const DEFAULT_UPLOAD_LIMITS = {
  maxSizeBytes: 8 * 1024 * 1024,
  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ],
};

export type UploadLimits = typeof DEFAULT_UPLOAD_LIMITS;

// Sniffs the real file type from its bytes instead of trusting the
// browser-supplied MIME type, which is trivial to spoof.
const MAGIC_BYTES: Array<{ mime: string; check: (bytes: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: "image/webp",
    check: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: "application/pdf",
    check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

export function sniffMimeType(bytes: Uint8Array): string | null {
  return MAGIC_BYTES.find((m) => m.check(bytes))?.mime ?? null;
}

export const ATTACHMENT_KINDS = [
  "comprovante",
  "nota_fiscal",
  "contrato",
  "orcamento",
  "recibo",
  "imagem",
  "documento",
  "outro",
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const DOCUMENT_ENTITY_TYPES = ["raffle", "financial_transaction"] as const;

export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  comprovante: "Comprovante de pagamento",
  nota_fiscal: "Nota fiscal",
  contrato: "Contrato",
  orcamento: "Orçamento",
  recibo: "Recibo",
  imagem: "Imagem",
  documento: "Documento",
  outro: "Outro",
};

export const ATTACHMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  UPLOADING: "Enviando",
  UPLOADED: "Enviado",
  FAILED: "Falhou",
};
