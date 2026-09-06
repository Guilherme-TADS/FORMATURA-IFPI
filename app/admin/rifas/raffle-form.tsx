"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { slugify } from "@/lib/slug";
import { raffleFormSchema, type RaffleFormValues } from "@/lib/schemas/raffle";
import { createRaffle, updateRaffle } from "./actions";

function toLocalInputValue(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function RaffleForm({
  raffleId,
  defaultValues,
}: {
  raffleId?: string;
  defaultValues?: Partial<RaffleFormValues> & {
    startsAtIso?: string;
    endsAtIso?: string;
  };
}) {
  const isEditing = Boolean(raffleId);
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(raffleFormSchema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      slug: defaultValues?.slug ?? "",
      description: defaultValues?.description ?? "",
      rules: defaultValues?.rules ?? "",
      imageUrl: defaultValues?.imageUrl ?? "",
      totalPoints: defaultValues?.totalPoints ?? 100,
      unitPriceLabel: defaultValues?.unitPriceLabel ?? "",
      startsAt: toLocalInputValue(defaultValues?.startsAtIso),
      endsAt: toLocalInputValue(defaultValues?.endsAtIso),
      googleSheetUrl: defaultValues?.googleSheetUrl ?? "",
      internalNotes: defaultValues?.internalNotes ?? "",
    },
  });

  async function onSubmit(values: RaffleFormValues) {
    setServerError(null);
    const result = raffleId
      ? await updateRaffle(raffleId, values)
      : await createRaffle(values);
    if (result?.error) {
      setServerError(result.error);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid max-w-xl gap-4"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!slugTouched) {
                      form.setValue("slug", slugify(e.target.value));
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Identificador (URL pública)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.onChange(e);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={3}
                  className="border-input min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="rules"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Regulamento</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={3}
                  className="border-input min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL da imagem</FormLabel>
              <FormControl>
                <Input {...field} placeholder="https://..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="totalPoints"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade de números</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value as number}
                    type="number"
                    min={1}
                    max={100000}
                    disabled={isEditing}
                  />
                </FormControl>
                {isEditing ? (
                  <p className="text-muted-foreground text-xs">
                    Não é possível alterar após a criação.
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="unitPriceLabel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor por número (R$)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="10,00" inputMode="decimal" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Início das vendas</FormLabel>
                <FormControl>
                  <Input {...field} type="datetime-local" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Encerramento</FormLabel>
                <FormControl>
                  <Input {...field} type="datetime-local" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="googleSheetUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Planilha de conferência (opcional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="https://docs.google.com/..." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="internalNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações internas</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={2}
                  className="border-input min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
            {form.formState.isSubmitting
              ? "Salvando..."
              : isEditing
                ? "Salvar alterações"
                : "Criar rifa"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
