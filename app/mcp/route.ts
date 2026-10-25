// MCP remoto do Core Finance: Streamable HTTP sem estado (JSON-RPC por POST,
// sem SSE). URL: https://finance.corestudio.ai/mcp
// Auth: "Authorization: Bearer cf_mcp_…" (ou x-mcp-token). Doc: docs/mcp.md
import { NextRequest } from "next/server";
import { comIdentidadeMcp } from "@/lib/mcp/contexto";
import { ACOES, instrucoesPara } from "@/lib/mcp/acoes";
import { atenderJsonRpc, NOME_SERVIDOR, VERSAO } from "@/lib/mcp/nucleo";
import { auditorDe } from "@/lib/mcp/sessao";
import { autenticar, CORS, json, quemDe } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const rpcErro = (code: number, message: string, status: number, extra: Record<string, string> = {}) =>
  json({ jsonrpc: "2.0", error: { code, message }, id: null }, status, extra);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// GET sem stream = saúde (sem dados, sem token). O servidor não abre SSE.
export function GET(req: NextRequest) {
  if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
    return rpcErro(-32000, "Servidor sem estado: sem SSE. Use POST.", 405, { Allow: "POST, OPTIONS" });
  }
  return json({
    nome: NOME_SERVIDOR,
    versao: VERSAO,
    transporte: "streamable-http (POST, sem estado)",
    auth: "Authorization: Bearer cf_mcp_…",
    api: "/api/v1",
  });
}

export async function POST(req: NextRequest) {
  const id = await autenticar(req.headers, "mcp", (msg, status, extra) =>
    rpcErro(status === 401 ? -32001 : -32603, msg, status, extra)
  );
  if (id instanceof Response) return id;

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return rpcErro(-32700, "Corpo não é JSON válido.", 400);
  }

  const resposta = await comIdentidadeMcp(id, () =>
    atenderJsonRpc(corpo, {
      acoes: ACOES,
      quem: quemDe(id),
      instrucoes: instrucoesPara(id.nome),
      auditar: auditorDe(id),
    })
  );
  if (resposta === null) return new Response(null, { status: 202, headers: CORS });
  return json(resposta);
}
