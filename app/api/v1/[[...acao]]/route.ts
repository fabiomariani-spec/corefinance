// API REST do Core Finance, gerada do mesmo registro de ações do MCP.
//   GET  /api/v1            → lista de ações (nome, descrição, escrita, schema)
//   GET  /api/v1/<acao>?…   → ação de leitura
//   POST /api/v1/<acao>     → qualquer ação, argumentos no corpo JSON
// Mesmo token (cf_mcp_…), mesma pessoa, mesma auditoria (mcp_calls.canal='api').
// Resposta { ok: true, dados } ou { ok: false, erro } com 400/401/403/404/405/422/500.
import { NextRequest } from "next/server";
import { comIdentidadeMcp } from "@/lib/mcp/contexto";
import { ACOES } from "@/lib/mcp/acoes";
import { atenderRest } from "@/lib/mcp/nucleo";
import { auditorDe } from "@/lib/mcp/sessao";
import { autenticar, CORS, json, quemDe } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ acao?: string[] }> };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function atender(req: NextRequest, ctx: Ctx) {
  const id = await autenticar(req.headers, "api", (erro, status, extra) => json({ ok: false, erro }, status, extra));
  if (id instanceof Response) return id;

  const { acao } = await ctx.params;
  const corpo = req.method === "POST" ? await req.text() : "";
  const r = await comIdentidadeMcp(id, () =>
    atenderRest({
      metodo: req.method,
      caminho: (acao ?? []).join("/"),
      query: req.nextUrl.searchParams,
      corpo,
      acoes: ACOES,
      quem: quemDe(id),
      auditar: auditorDe(id),
    })
  );
  return json(r.body, r.status);
}

export const GET = atender;
export const POST = atender;
