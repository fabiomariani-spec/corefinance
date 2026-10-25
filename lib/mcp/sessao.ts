import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import type { McpIdentidade } from "@/lib/mcp/contexto";
import { argsParaAuditoria, hashToken, tokenBemFormado, type Auditar } from "@/lib/mcp/nucleo";

/** A migração do MCP (prisma/sql/mcp_remoto_2026-10-24.sql) ainda não foi aplicada. */
export class McpNaoConfigurado extends Error {}

type LinhaToken = {
  id: string;
  name: string;
  can_write: boolean;
  escrita_geral: boolean | null;
  membro_id: string;
  user_id: string;
  company_id: string;
  role: UserRole;
  nome: string;
  email: string;
};

/**
 * Token puro → pessoa da equipe. Só o sha256 fica no banco. Devolve null se o
 * token não existe, foi revogado ou a pessoa saiu da empresa (isActive=false).
 * Marca last_used_at.
 */
export async function resolverToken(bruto: string, canal: "mcp" | "api"): Promise<McpIdentidade | null> {
  if (!tokenBemFormado(bruto)) return null;
  let linhas: LinhaToken[];
  try {
    linhas = await prisma.$queryRaw<LinhaToken[]>`
      UPDATE mcp_tokens t
         SET last_used_at = now()
        FROM company_users cu
       WHERE t.key_hash = ${hashToken(bruto)}
         AND t.active
         AND cu.id = t.acting_user_id
         AND cu."isActive"
      RETURNING t.id::text AS id, t.name, t.can_write,
                (SELECT (value->>'escrita')::boolean FROM system_config WHERE key = 'mcp_remoto') AS escrita_geral,
                cu.id AS membro_id, cu."userId" AS user_id, cu."companyId" AS company_id,
                cu.role::text AS role, cu.name AS nome, cu.email AS email`;
  } catch (e) {
    // 42P01 = tabela não existe
    const txt = `${(e as { code?: string })?.code ?? ""} ${JSON.stringify((e as { meta?: unknown })?.meta ?? "")} ${(e as Error)?.message ?? e}`;
    if (/42P01|relation .* does not exist/.test(txt)) {
      throw new McpNaoConfigurado("Tabelas do MCP ausentes: aplicar prisma/sql/mcp_remoto_2026-10-24.sql.");
    }
    throw e;
  }
  const t = linhas[0];
  if (!t) return null;
  return {
    tokenId: t.id,
    tokenNome: t.name,
    podeEscrever: t.can_write && t.escrita_geral === true,
    canal,
    membroId: t.membro_id,
    userId: t.user_id,
    companyId: t.company_id,
    role: t.role,
    nome: t.nome,
    email: t.email,
  };
}

/** Uma linha em mcp_calls por chamada de ação, com o canal (mcp | api). */
export function auditorDe(id: McpIdentidade): Auditar {
  return async ({ acao, args, ok, erro, ms }) => {
    const a = JSON.stringify(argsParaAuditoria(args));
    await prisma.$executeRaw`
      INSERT INTO mcp_calls (token_id, tool, canal, args, ok, error, ms)
      VALUES (${id.tokenId}::uuid, ${acao}, ${id.canal}, ${a}::jsonb, ${ok}, ${erro?.slice(0, 1000) ?? null}, ${ms})`;
  };
}
