import { z } from "zod";

export const raffleFormSchema = z
  .object({
    title: z.string().trim().min(3, "Informe um título com ao menos 3 caracteres."),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens."),
    description: z.string().trim().optional(),
    rules: z.string().trim().optional(),
    imageUrl: z.union([z.string().trim().url("URL de imagem inválida."), z.literal("")]).optional(),
    totalPoints: z.coerce
      .number()
      .int("Deve ser um número inteiro.")
      .min(1, "Deve haver ao menos 1 número.")
      .max(100000, "No máximo 100.000 números."),
    unitPriceLabel: z.string().trim().min(1, "Informe o valor do número."),
    startsAt: z.string().min(1, "Informe a data de início."),
    endsAt: z.string().min(1, "Informe a data de encerramento."),
    googleSheetUrl: z.union([z.string().trim().url("URL inválida."), z.literal("")]).optional(),
    internalNotes: z.string().trim().optional(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "A data de encerramento deve ser depois da data de início.",
    path: ["endsAt"],
  });

export type RaffleFormValues = z.infer<typeof raffleFormSchema>;
