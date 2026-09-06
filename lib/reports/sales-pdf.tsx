import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { centsToBRL } from "@/lib/money";
import type { SalesReportRow } from "./sales";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 14, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 12 },
  table: { display: "flex", width: "auto" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd", paddingVertical: 4 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000", paddingBottom: 4, marginBottom: 2 },
  headerCell: { fontFamily: "Helvetica-Bold" },
  cellBuyer: { width: "20%" },
  cellNumbers: { width: "16%" },
  cellAmount: { width: "10%" },
  cellPayment: { width: "12%" },
  cellSeller: { width: "16%" },
  cellStatus: { width: "10%" },
  cellDate: { width: "16%" },
  totalRow: { flexDirection: "row", marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#000" },
});

const STATUS_LABELS: Record<string, string> = { CONFIRMED: "Confirmada", CANCELLED: "Cancelada" };

export function SalesReportPdf({
  rows,
  totalAmountCents,
  generatedAt,
  filterSummary,
}: {
  rows: SalesReportRow[];
  totalAmountCents: number;
  generatedAt: string;
  filterSummary: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Relatório de vendas</Text>
        <Text style={styles.subtitle}>
          Gerado em {generatedAt}
          {filterSummary ? ` · Filtros: ${filterSummary}` : ""} · {rows.length} vendas
        </Text>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={[styles.cellBuyer, styles.headerCell]}>Comprador</Text>
            <Text style={[styles.cellNumbers, styles.headerCell]}>Números</Text>
            <Text style={[styles.cellAmount, styles.headerCell]}>Valor</Text>
            <Text style={[styles.cellPayment, styles.headerCell]}>Pagamento</Text>
            <Text style={[styles.cellSeller, styles.headerCell]}>Vendedor</Text>
            <Text style={[styles.cellStatus, styles.headerCell]}>Status</Text>
            <Text style={[styles.cellDate, styles.headerCell]}>Data</Text>
          </View>
          {rows.map((row) => (
            <View key={row.id} style={styles.row} wrap={false}>
              <Text style={styles.cellBuyer}>{row.buyerName}</Text>
              <Text style={styles.cellNumbers}>{row.pointNumbers.join(", ")}</Text>
              <Text style={styles.cellAmount}>{centsToBRL(row.amountCents)}</Text>
              <Text style={styles.cellPayment}>{row.paymentMethod}</Text>
              <Text style={styles.cellSeller}>{row.sellerName}</Text>
              <Text style={styles.cellStatus}>{STATUS_LABELS[row.status] ?? row.status}</Text>
              <Text style={styles.cellDate}>{new Date(row.createdAt).toLocaleString("pt-BR")}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>
            Total: {centsToBRL(totalAmountCents)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
