"use client";

import { useRef, useState } from "react";
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

  const [file, setFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(values: TransactionFormValues) {
    setServerError(null);
    const result = await createTransaction(type, values);
    if (result?.error) {
      setServerError(result.error);
      return;
    }

    if (file && result.id) {
      setUploadingFile(true);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("kind", type === "EXPENSE" ? "nota_fiscal" : "recibo");
      formData.set("entityType", "financial_transaction");
      formData.set("entityId", result.id);
      formData.set("description", values.description);

      try {
        const uploadRes = await fetch("/api/uploads/documento", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          toast.warning("Lançamento salvo, mas houve falha ao anexar o comprovante.");
        } else {
          toast.success(
            type === "INCOME"
              ? "Receita registrada e comprovante anexado!"
              : "Despesa registrada e comprovante anexado!",
          );
        }
      } catch {
        toast.warning("Lançamento salvo, mas ocorreu erro no envio do arquivo.");
      } finally {
        setUploadingFile(false);
      }
    } else {
      toast.success(type === "INCOME" ? "Receita registrada." : "Despesa registrada.");
    }

    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
                <FormLabel>Fornecedor / Beneficiário (quem recebeu o valor)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="ex: Buffet, DJ, Gráfica, Decoração" />
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
                    <option value="">Não especificada / Selecione...</option>
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
              <FormLabel>
                {type === "INCOME"
                  ? "Fonte pagadora (quem fez o pagamento)"
                  : "Conta / Origem do recurso (de onde saiu o dinheiro)"}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={
                    type === "INCOME"
                      ? "ex: Barraca de doces, Patrocínio, Doação da turma"
                      : "ex: Caixa físico da turma, Conta corrente / Pix"
                  }
                />
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

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="transaction-file">
            {type === "EXPENSE"
              ? "Comprovante / Nota Fiscal (opcional)"
              : "Comprovante / Recibo (opcional)"}
          </label>
          <input
            id="transaction-file"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="border-input h-9 w-full rounded-lg border bg-transparent px-2.5 text-xs outline-none file:mr-2 file:h-full file:border-0 file:bg-transparent file:text-xs file:font-medium"
          />
          <p className="text-muted-foreground text-xs">
            Formatos aceitos: JPG, PNG, WEBP ou PDF (até 8MB). Ficará salvo em Documentos vinculado a este lançamento.
          </p>
        </div>

        {serverError ? (
          <p role="alert" className="text-destructive text-sm">
            {serverError}
          </p>
        ) : null}

        <div>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || uploadingFile}
          >
            {form.formState.isSubmitting || uploadingFile
              ? "Salvando e enviando..."
              : "Registrar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
