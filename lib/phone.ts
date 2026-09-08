/**
 * Funções utilitárias para validação, formatação e comparação de telefones brasileiros.
 */

/**
 * Normaliza uma string de telefone para apenas dígitos, removendo DDI 55 caso informado.
 * Retorna null se não tiver entre 10 e 11 dígitos (DDD + 8 ou 9 dígitos).
 */
export function normalizePhoneDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length < 10 || digits.length > 11) {
    return null;
  }
  return digits;
}

/**
 * Formata um telefone progressivamente para máscaras de input:
 * (86) 99999-9999 ou (86) 8888-8888.
 */
export function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Decompõe um número normalizado em DDD, últimos 8 dígitos e partes para consultas SQL parciais.
 */
export function getPhoneSearchPattern(normalizedDigits: string): {
  ddd: string;
  last8: string;
  part1: string;
  part2: string;
} {
  const ddd = normalizedDigits.slice(0, 2);
  const last8 = normalizedDigits.slice(-8);
  const part1 = last8.slice(0, 4);
  const part2 = last8.slice(4);
  return { ddd, last8, part1, part2 };
}

/**
 * Determina se o telefone salvo no banco de dados corresponde ao número buscado.
 * Impede vazamento cruzado entre DDDs diferentes e valida sufixo de 8 dígitos.
 */
export function isPhoneMatch(
  candidateRaw: string | null | undefined,
  targetNormalizedDigits: string,
): boolean {
  if (!candidateRaw) return false;
  const candidateDigits = normalizePhoneDigits(candidateRaw);
  if (!candidateDigits) return false;

  const targetPattern = getPhoneSearchPattern(targetNormalizedDigits);
  const candidatePattern = getPhoneSearchPattern(candidateDigits);

  // Exige mesmo DDD estritamente
  if (candidatePattern.ddd !== targetPattern.ddd) {
    return false;
  }

  // Exige mesmos últimos 8 dígitos
  if (candidatePattern.last8 !== targetPattern.last8) {
    return false;
  }

  // Se ambos tiverem o mesmo tamanho (ex: ambos 11 dígitos), todos os dígitos devem coincidir
  if (candidateDigits.length === targetNormalizedDigits.length) {
    return candidateDigits === targetNormalizedDigits;
  }

  // Se um tiver 10 e o outro 11 dígitos (migração do 9º dígito), o match de DDD + last8 é suficiente
  return true;
}
