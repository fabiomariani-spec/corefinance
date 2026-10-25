import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "@prisma/client";

/**
 * Identidade de quem chama pelo MCP (/mcp) ou pela API (/api/v1).
 *
 * As rotas de app/api resolvem a pessoa pelo cookie do Supabase (lib/auth.ts).
 * O MCP não tem cookie: ele valida o token (cf_mcp_…), descobre a pessoa e roda
 * a ação dentro deste contexto. Enquanto ele está ativo, getCompanyId(),
 * getCompanyContext() e requireAuth() devolvem a pessoa do token — então as
 * rotas existentes rodam sem mudança, com a empresa, o papel e as checagens
 * (ex.: "só ADMIN convida") dela.
 *
 * Só app/mcp e app/api/v1 abrem este contexto, e só depois de validar o token.
 */
export interface McpIdentidade {
  tokenId: string;
  tokenNome: string;
  /** can_write do token E a chave geral (system_config.mcp_remoto.escrita). */
  podeEscrever: boolean;
  canal: "mcp" | "api";
  /** company_users.id */
  membroId: string;
  /** auth.users.id (Supabase) */
  userId: string;
  companyId: string;
  role: UserRole;
  nome: string;
  email: string;
}

const armazem = new AsyncLocalStorage<McpIdentidade>();

export function comIdentidadeMcp<T>(id: McpIdentidade, fn: () => Promise<T>): Promise<T> {
  return armazem.run(id, fn);
}

export function identidadeMcp(): McpIdentidade | undefined {
  return armazem.getStore();
}
