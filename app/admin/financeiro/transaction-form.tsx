"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  transactionFormSchema,
  type TransactionFormValues,
} from "@/lib/schemas/financial";
import { createTransaction } from "./actions";

type Option = { id: string; name: string | null };

export function TransactionForm({
  type,
  categories,
  paymentMethods,
}: {
  type: "INCOME" | "EXPENSE";
  categories: Option[];
  paymentMethods: Option[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      description: "",
      categoryId: "",
      supplierName: "",
      amountLabel: "",
      occurredOn: new Date().toISOString().slice(0, 10),
      paymentMethodId: "",
      origin: "",
      notes: "",
    },
  });

  async function onSubmit(values: TransactionFormValues) {
    setServerError(null);
    const result = await createTransaction(type, values);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    toast.success(type === "INCOME" ? "Receita registrada." : "Despesa registrada.");
    form.reset({
      description: "",
      categoryId: "",
      supplierName: "",
      amountLabel: "",
      occurredOn: new Date().toISOString().slice(0, 10),
      paymentMethodId: "",
      origin: "",
      notes: "",
    });
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-lg gap-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none"
                  >
                    <option value="">Selecione...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amountLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="0,00" inputMode="decimal" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {type === "EXPENSE" ? (
          <FormField
            control={form.control}
            name="supplierName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornecedor (opcional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="occurredOn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data</FormLabel>
                <FormControl>
                  <Input {...field} type="date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentMethodId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forma de pagamento (opcional)</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none"
                  >
                    <option value="">—</option>
                    {paymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="origin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Origem (opcional)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações (opcional)</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={2}
                  className="border-input min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError ? (
          <p role="alert" className="text-destructive text-sm">
            {serverError}
          </p>
        ) : null}

        <div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Salvando..." : "Registrar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
