import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { querySalesReport, parseSalesReportFilters } from "@/lib/reports/sales";
import { SalesReportPdf } from "@/lib/reports/sales-pdf";
import { centsToBRL } from "@/lib/money";

const STATUS_LABELS: Record<string, string> = { CONFIRMED: "Confirmada", CANCELLED: "Cancelada" };

// Exports ignore pagination and return every matching row up to this cap —
// generous for a single graduation committee's raffle volume, but bounded so
// a pathological filter (or none at all) can't generate an unbounded file.
const MAX_EXPORT_ROWS = 5000;

function csvEscape(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || (profile.role !== "ADMIN" && profile.role !== "VISUALIZADOR")) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const filters = parseSalesReportFilters({
    buyer: url.searchParams.get("buyer") ?? undefined,
    seller: url.searchParams.get("seller") ?? undefined,
    numero: url.searchParams.get("numero") ?? undefined,
    pagamento: url.searchParams.get("pagamento") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    rifa: url.searchParams.get("rifa") ?? undefined,
    de: url.searchParams.get("de") ?? undefined,
    ate: url.searchParams.get("ate") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
  });

  const { rows } = await querySalesReport(supabase, filters, { page: 1, pageSize: MAX_EXPORT_ROWS });
  const totalAmountCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Vendas");
    sheet.columns = [
      { header: "Comprador", key: "buyer", width: 28 },
      { header: "Telefone", key: "phone", width: 16 },
      { header: "Números", key: "numbers", width: 20 },
      { header: "Valor (R$)", key: "amount", width: 12 },
      { header: "Pagamento", key: "payment", width: 14 },
      { header: "Vendedor", key: "seller", width: 22 },
      { header: "Status", key: "status", width: 12 },
      { header: "Rifa", key: "raffle", width: 24 },
      { header: "Data", key: "date", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow({
        buyer: row.buyerName,
        phone: row.buyerPhone,
        numbers: row.pointNumbers.join(", "),
        amount: row.amountCents / 100,
        payment: row.paymentMethod,
        seller: row.sellerName,
        status: STATUS_LABELS[row.status] ?? row.status,
        raffle: row.raffleTitle,
        date: new Date(row.createdAt).toLocaleString("pt-BR"),
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="vendas-${timestamp}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await renderToBuffer(
      SalesReportPdf({
        rows,
        totalAmountCents,
        generatedAt: new Date().toLocaleString("pt-BR"),
        filterSummary: "",
      }),
    );
    return new NextResponse(buffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vendas-${timestamp}.pdf"`,
      },
    });
  }

  // Default: CSV. Semicolon-delimited (not comma) so it opens correctly in
  // pt-BR Excel, which treats comma as the decimal separator.
  const header = ["Comprador", "Telefone", "Números", "Valor (R$)", "Pagamento", "Vendedor", "Status", "Rifa", "Data"];
  const lines = [header.join(";")];
  for (const row of rows) {
    lines.push(
      [
        row.buyerName,
        row.buyerPhone,
        row.pointNumbers.join(", "),
        (row.amountCents / 100).toFixed(2).replace(".", ","),
        row.paymentMethod,
        row.sellerName,
        STATUS_LABELS[row.status] ?? row.status,
        row.raffleTitle,
        new Date(row.createdAt).toLocaleString("pt-BR"),
      ]
        .map(csvEscape)
        .join(";"),
    );
  }
  lines.push("");
  lines.push(`Total;;;${centsToBRL(totalAmountCents)}`);

  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas-${timestamp}.csv"`,
    },
  });
}
