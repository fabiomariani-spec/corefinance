import { NextResponse } from "next/server";
import type { McpIdentidade } from "@/lib/mcp/contexto";
import { tokenDoPedido, type Quem } from "@/lib/mcp/nucleo";
import { McpNaoConfigurado, resolverToken } from "@/lib/mcp/sessao";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, x-mcp-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}

export function quemDe(id: McpIdentidade): Quem {
  return { role: id.role, podeEscrever: id.podeEscrever };
}

/**
 * Valida o token do pedido. Devolve a pessoa ou a resposta de erro pronta:
 * 401 (sem token, token errado/revogado) com WWW-Authenticate, ou 503 se a
 * migração do MCP ainda não foi aplicada.
 */
export async function autenticar(
  headers: Headers,
  canal: "mcp" | "api",
  negado: (msg: string, status: number, extra: Record<string, string>) => Response
): Promise<McpIdentidade | Response> {
  const realm = { "WWW-Authenticate": `Bearer realm="core-finance-${canal}"` };
  const bruto = tokenDoPedido(headers);
  if (!bruto) return negado("Falta o token (Authorization: Bearer cf_mcp_…).", 401, realm);
  try {
    const id = await resolverToken(bruto, canal);
    if (!id) return negado("Token inválido ou revogado.", 401, realm);
    return id;
  } catch (e) {
    if (e instanceof McpNaoConfigurado) return negado(e.message, 503, {});
    console.error(`[${canal}] token:`, e);
    return negado("Erro interno ao validar o token.", 500, {});
  }
}
