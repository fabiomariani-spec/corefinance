/**
 * Ordenação da coluna "Nome" da listagem de lançamentos.
 *
 * A coluna mostra um nome só, mas ele vem de duas relações diferentes:
 * `employee` (colaborador, nas despesas de pessoal) ou `contact` (cliente, nas
 * vendas que entram por webhook). Ordenar por ela é ordenar por
 * COALESCE(employee.name, contact.name) — algo que o `orderBy` do Prisma não
 * expressa: um array `[{ employee: { name } }, { contact: { name } }]`
 * ordenaria em dois blocos (todos os colaboradores, depois todos os clientes),
 * não numa lista alfabética única.
 *
 * Solução em duas etapas: o Prisma continua montando o WHERE (complexo demais
 * pra reescrever em SQL sem duplicar regra de negócio) e devolve os ids que
 * batem; o Postgres ordena e pagina esses ids pelo nome coalescido.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** `true` quando o cliente pediu ordenação pela coluna "Nome". */
export function isPersonNameSort(sortBy: string): boolean {
  // "employee" é o id antigo da coluna (quando ela se chamava "Colaborador"),
  // mantido para não quebrar links/integrações que ainda mandem esse valor.
  return sortBy === "name" || sortBy === "employee";
}

/**
 * Recebe os ids já filtrados, devolve a fatia da página na ordem alfabética do
 * nome (colaborador OU cliente).
 */
export async function orderIdsByPersonName(
  ids: string[],
  sortOrder: "asc" | "desc",
  skip: number,
  take: number
): Promise<string[]> {
  if (ids.length === 0) return [];

  // NULLS LAST nos dois sentidos: lançamentos sem nenhum nome vão sempre pro
  // fim — senão clicar "Nome" em decrescente encheria a 1ª página de traços.
  const direction = sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT t.id
    FROM transactions t
    LEFT JOIN employees e ON e.id = t."employeeId"
    LEFT JOIN contacts  c ON c.id = t."contactId"
    WHERE t.id = ANY(${ids}::text[])
    ORDER BY COALESCE(e.name, c.name) ${direction} NULLS LAST,
             t."competenceDate" DESC,
             t.id
    LIMIT ${take} OFFSET ${skip}
  `);

  return rows.map((r) => r.id);
}
