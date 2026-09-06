import { z } from "zod";

export const transactionFormSchema = z.object({
  description: z.string().trim().min(3, "Descreva o lançamento."),
  categoryId: z.string().uuid("Selecione uma categoria."),
  supplierName: z.string().trim().optional(),
  amountLabel: z.string().trim().min(1, "Informe o valor."),
  occurredOn: z.string().min(1, "Informe a data."),
  paymentMethodId: z.string().uuid().optional().or(z.literal("")),
  origin: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export const editTransactionSchema = z.object({
  description: z.string().trim().min(3, "Descreva o lançamento."),
  categoryId: z.string().uuid("Selecione uma categoria."),
  amountLabel: z.string().trim().min(1, "Informe o valor."),
  occurredOn: z.string().min(1, "Informe a data."),
  reason: z.string().trim().min(3, "Informe o motivo da alteração."),
});

export type EditTransactionValues = z.infer<typeof editTransactionSchema>;
