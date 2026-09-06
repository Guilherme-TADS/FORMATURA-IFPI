/**
 * Gerador de Payload Pix no padrão oficial do Banco Central do Brasil (BR Code / EMV).
 * Gera a string "Pix Copia e Cola" com valor exato, chave, nome e cidade do recebedor.
 */

export type PixPayloadInput = {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amountCents?: number;
  txId?: string;
  description?: string;
};

/**
 * Remove acentos e caracteres especiais para compatibilidade estrita com o padrão EMV.
 */
function sanitizeText(text: string, maxLength: number): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

/**
 * Formata um campo TLV (Tag-Length-Value) do padrão EMV.
 */
function formatTlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Calcula o CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) conforme especificação do Bacen.
 */
export function calculateCrc16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Gera a string Pix Copia e Cola completa com CRC16.
 */
export function generatePixPayload({
  pixKey,
  merchantName,
  merchantCity,
  amountCents,
  txId = "***",
  description,
}: PixPayloadInput): string {
  const cleanKey = pixKey.trim();
  if (!cleanKey) return "";

  const cleanName = sanitizeText(merchantName || "FORMATURA", 25) || "FORMATURA";
  const cleanCity = sanitizeText(merchantCity || "CIDADE", 15) || "CIDADE";
  const cleanTxId = sanitizeText(txId, 25) || "***";

  // 00: Payload Format Indicator
  let payload = formatTlv("00", "01");

  // 01: Point of Initiation Method (12 = transação dinâmica/única se tiver valor)
  if (amountCents && amountCents > 0) {
    payload += formatTlv("01", "12");
  }

  // 26: Merchant Account Information
  let merchantAccount = formatTlv("00", "br.gov.bcb.pix");
  merchantAccount += formatTlv("01", cleanKey);
  if (description) {
    merchantAccount += formatTlv("02", sanitizeText(description, 40));
  }
  payload += formatTlv("26", merchantAccount);

  // 52: Merchant Category Code
  payload += formatTlv("52", "0000");

  // 53: Transaction Currency (986 = BRL)
  payload += formatTlv("53", "986");

  // 54: Transaction Amount
  if (amountCents && amountCents > 0) {
    const formattedAmount = (amountCents / 100).toFixed(2);
    payload += formatTlv("54", formattedAmount);
  }

  // 58: Country Code
  payload += formatTlv("58", "BR");

  // 59: Merchant Name
  payload += formatTlv("59", cleanName);

  // 60: Merchant City
  payload += formatTlv("60", cleanCity);

  // 62: Additional Data Field Template (TxID)
  const additionalData = formatTlv("05", cleanTxId);
  payload += formatTlv("62", additionalData);

  // 63: CRC16 (Tag + Tamanho 04 + valor calculado)
  const payloadWithoutCrc = `${payload}6304`;
  const crc = calculateCrc16(payloadWithoutCrc);

  return `${payloadWithoutCrc}${crc}`;
}
