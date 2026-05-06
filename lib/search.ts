/**
 * Search helpers: case + accent insensitive.
 *
 * Uses Postgres `translate()` (built-in, no extension needed) to strip accents
 * server-side, and normalizes the search term on the caller side via
 * `normalizeForSearch` so both halves of the comparison match.
 *
 * Example: user types "SALARIO" — finds "Salário", "salario", "salário".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const UNACCENTED = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";

/**
 * Strip accents + lowercase, matching what the SQL side does.
 * "Café" → "cafe", "SALÁRIO" → "salario".
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Resolve a search term to matching transaction IDs for a company.
 * Matches against: description, category.name, department.name, contact.name.
 * Returns up to `limit` distinct IDs.
 */
export async function searchTransactionIds(
  companyId: string,
  searchTerm: string,
  limit = 5000
): Promise<string[]> {
  const needle = `%${normalizeForSearch(searchTerm)}%`;
  // Schema usa camelCase nas colunas (sem @map), então identificadores
  // precisam ir entre aspas duplas — caso contrário o Postgres lowercaseia.
  // Match também em employees (colaborador) — assim "jorge" acha
  // lançamentos vinculados ao colaborador Jorge mesmo que a descrição não
  // mencione o nome.
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT DISTINCT t.id
    FROM transactions t
    LEFT JOIN categories c ON c.id = t."categoryId"
    LEFT JOIN departments d ON d.id = t."departmentId"
    LEFT JOIN contacts ct ON ct.id = t."contactId"
    LEFT JOIN employees e ON e.id = t."employeeId"
    WHERE t."companyId" = ${companyId}
      AND (
        translate(lower(t.description), ${ACCENTED}, ${UNACCENTED}) LIKE ${needle}
        OR translate(lower(c.name),   ${ACCENTED}, ${UNACCENTED}) LIKE ${needle}
        OR translate(lower(d.name),   ${ACCENTED}, ${UNACCENTED}) LIKE ${needle}
        OR translate(lower(ct.name),  ${ACCENTED}, ${UNACCENTED}) LIKE ${needle}
        OR translate(lower(e.name),   ${ACCENTED}, ${UNACCENTED}) LIKE ${needle}
      )
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}
