/**
 * Strip accents + lowercase — accent + case insensitive comparisons.
 * "Café" → "cafe", "SALÁRIO" → "salario", "JOÃO" → "joao".
 *
 * Pure (no DOM, no React, no Prisma) — pode ser usado em client OU server.
 *
 * Server-side, `lib/search.ts` casa essa função com `translate()` no Postgres
 * pra busca SQL accent-insensitive. No client, é usada em filtros de listas.
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    // U+0300 a U+036F: bloco "Combining Diacritical Marks" — acentos.
    .replace(/[̀-ͯ]/g, "");
}
