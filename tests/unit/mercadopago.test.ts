import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMercadoPagoPixPayment,
  getMercadoPagoPayment,
} from "@/lib/mercadopago";

describe("Mercado Pago Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createMercadoPagoPixPayment", () => {
    it("throws when accessToken is empty", async () => {
      await expect(
        createMercadoPagoPixPayment({
          accessToken: "",
          amountCents: 1000,
          description: "Rifa 01",
          payer: { fullName: "João Silva" },
          externalReference: "sale-123",
        }),
      ).rejects.toThrow("Token de acesso do Mercado Pago não configurado.");
    });

    it("throws when amountCents is 0 or negative", async () => {
      await expect(
        createMercadoPagoPixPayment({
          accessToken: "TEST-TOKEN",
          amountCents: 0,
          description: "Rifa 01",
          payer: { fullName: "João Silva" },
          externalReference: "sale-123",
        }),
      ).rejects.toThrow("Valor do pagamento inválido.");
    });

    it("sends correct payload and parses response successfully", async () => {
      const mockResponse = {
        id: 99887766,
        status: "pending",
        status_detail: "waiting_transfer",
        date_of_expiration: "2026-09-07T12:00:00.000Z",
        point_of_interaction: {
          transaction_data: {
            qr_code: "00020126580014br.gov.bcb.pix...",
            qr_code_base64: "iVBORw0KGgoAAAANSUhEUgAA...",
            ticket_url: "https://mercadopago.com/ticket",
          },
        },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });
      globalThis.fetch = fetchMock;

      const result = await createMercadoPagoPixPayment({
        accessToken: "APP_USR-123456",
        amountCents: 2550,
        description: "Rifa Formatura - Ponto 05",
        payer: {
          fullName: "Carlos Eduardo Santos",
          phone: "(86) 99999-1234",
          email: "carlos@teste.com",
        },
        externalReference: "sale-uuid-789",
        notificationUrl: "https://formatura.com/api/webhooks/mercadopago",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.mercadopago.com/v1/payments");
      expect(options.headers["Authorization"]).toBe("Bearer APP_USR-123456");
      expect(options.headers["X-Idempotency-Key"]).toBe("pix_sale-uuid-789");

      const sentBody = JSON.parse(options.body);
      expect(sentBody.transaction_amount).toBe(25.5);
      expect(sentBody.payment_method_id).toBe("pix");
      expect(sentBody.payer.first_name).toBe("Carlos");
      expect(sentBody.payer.last_name).toBe("Eduardo Santos");
      expect(sentBody.payer.email).toBe("carlos@teste.com");
      expect(sentBody.external_reference).toBe("sale-uuid-789");
      expect(sentBody.notification_url).toBe("https://formatura.com/api/webhooks/mercadopago");

      expect(result.id).toBe(99887766);
      expect(result.status).toBe("pending");
      expect(result.qrCode).toBe("00020126580014br.gov.bcb.pix...");
      expect(result.qrCodeBase64).toBe("iVBORw0KGgoAAAANSUhEUgAA...");
    });
  });

  describe("getMercadoPagoPayment", () => {
    it("fetches payment details and maps amount correctly", async () => {
      const mockPayment = {
        id: 99887766,
        status: "approved",
        status_detail: "accredited",
        external_reference: "sale-uuid-789",
        transaction_amount: 50.0,
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayment,
      });
      globalThis.fetch = fetchMock;

      const result = await getMercadoPagoPayment(99887766, "APP_USR-123456");
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.mercadopago.com/v1/payments/99887766",
        {
          method: "GET",
          headers: {
            "Authorization": "Bearer APP_USR-123456",
            "Content-Type": "application/json",
          },
        },
      );

      expect(result.id).toBe(99887766);
      expect(result.status).toBe("approved");
      expect(result.externalReference).toBe("sale-uuid-789");
      expect(result.amountCents).toBe(5000);
    });
  });
});
