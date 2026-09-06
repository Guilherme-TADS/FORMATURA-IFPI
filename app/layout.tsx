import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Comissão de Formatura",
    template: "%s · Comissão de Formatura",
  },
  description: "Gestão financeira e rifas da comissão de formatura.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          impeccable-direction f1e14e14
          THESIS: A raffle number and a ledger entry are receipts, not spreadsheet
          cells — refuses the generic equal-card admin panel.
          OWN-WORLD: paper and ink — warm-neutral paper ground, graphite ink,
          institutional emerald for confirmed, amber for pending, void-red for
          cancelled; tabular numerals (Geist Mono) for money/numbers/IDs;
          perforated dividers between sections; a stamp mark as the confirmed-state
          signature.
          STORY: a buyer feels they are filling out a real receipt, not a form; the
          committee reads state at a glance, no explaining required.
          FIRST VIEWPORT: the number grid as a wall of receipts — each number a
          stub card with immediate visual state and tabular value.
          FORM: PIX receipt / comprovante — IMPECCABLE'S PICK, chosen over the
          rolled direction (index 6) by explicit user decision.
          FINISH: unreviewed and undocumented is unfinished; this build ends with
          the finish review, the verdict, DESIGN.md, and every shipping raster
          carrying its provenance.
        */}
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
