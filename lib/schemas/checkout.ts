import { z } from "zod";

export const buyerFormSchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo."),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone válido.")
    .regex(/^[\d()\s-]+$/, "Use apenas números, espaços, parênteses e hífen."),
  whatsapp: z.string().trim().optional(),
  instagram: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  paymentMethodId: z.string().uuid("Selecione uma forma de pagamento."),
});

export type BuyerFormValues = z.infer<typeof buyerFormSchema>;

export type SaleReceipt = {
  saleId: string;
  raffleTitle: string;
  buyerName: string;
  pointNumbers: number[];
  amountCents: number;
  paymentMethod: string;
  createdAt: string;
};
