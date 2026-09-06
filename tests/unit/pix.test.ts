import { describe, it, expect } from "vitest";
import { generatePixPayload, calculateCrc16 } from "@/lib/pix";

describe("Pix BR Code generator", () => {
  it("calculates standard CRC16-CCITT correctly", () => {
    // Standard test vector for CRC16-CCITT (0xFFFF initial, 0x1021 poly)
    const crc = calculateCrc16("123456789");
    expect(crc).toBe("29B1");
  });

  it("returns empty string when pixKey is missing or empty", () => {
    const payload = generatePixPayload({
      pixKey: "",
      merchantName: "Formatura ADS",
      merchantCity: "Teresina",
    });
    expect(payload).toBe("");
  });

  it("generates a valid EMV Pix payload with amount and CRC16", () => {
    const payload = generatePixPayload({
      pixKey: "formatura@teste.com",
      merchantName: "Formatura ADS 2026",
      merchantCity: "Teresina",
      amountCents: 2500, // R$ 25,00
      txId: "RIFA123",
    });

    // Deve começar com o cabeçalho padrão EMV
    expect(payload.startsWith("000201")).toBe(true);

    // Deve conter a GUI do Bacen
    expect(payload).toContain("br.gov.bcb.pix");

    // Deve conter a chave Pix
    expect(payload).toContain("formatura@teste.com");

    // Deve conter o valor formatado 25.00
    expect(payload).toContain("540525.00");

    // Deve conter o código do país BR e moeda 986
    expect(payload).toContain("5802BR");
    expect(payload).toContain("5303986");

    // Deve terminar com o campo 6304 seguido por 4 caracteres hexadecimais de CRC
    expect(payload).toMatch(/6304[A-F0-9]{4}$/);

    // A integridade do CRC16 gerado deve ser válida
    const dataPart = payload.slice(0, -4);
    const expectedCrc = calculateCrc16(dataPart);
    expect(payload.endsWith(expectedCrc)).toBe(true);
  });
});
