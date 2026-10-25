/**
 * Núcleo do MCP (/mcp) e da API REST (/api/v1) do Core Finance.
 *
 * As duas portas usam o MESMO registro de ações (lib/mcp/acoes.ts): uma ação
 * nova entra nas duas de uma vez. Aqui fica só o que não depende do banco nem
 * do Next — validação, permissão por papel, JSON-RPC e a tradução REST — para
 * dar pra testar com `node --test` (tests/mcp.test.mjs) sem subir o app.
 *
 * Padrão da Core: core-agents/docs/mcps/padrao.md. Uso: docs/mcp.md.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const VERSAO = "1.0.0";
export const NOME_SERVIDOR = "core-finance";
export const PREFIXO_TOKEN = "cf_mcp_";
export const SAIDA_MAX = 60_000;
const PROTOCOLOS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type Papel = "ADMIN" | "MANAGER" | "ACCOUNTANT" | "VIEWER" | "EVENTS_ONLY";

/**
 * Área da ação, para o papel EVENTS_ONLY (que na tela só vê /eventos):
 *  - "eventos": telas de eventos
 *  - "apoio":   leituras que a tela de eventos também usa (categorias, contatos…)
 *  - "geral":   o resto do financeiro
 */
export type Area = "geral" | "eventos" | "apoio";

export interface Quem {
  role: Papel;
  podeEscrever: boolean;
}

export interface Acao {
  nome: string;
  descricao: string;
  schema: z.ZodObject;
  escrita: boolean;
  area: Area;
  executar: (args: never) => Promise<unknown>;
}

/** Define uma ação com o tipo dos argumentos inferido do schema. */
export function acao<S extends z.ZodObject>(def: {
  nome: string;
  descricao: string;
  schema: S;
  escrita: boolean;
  area?: Area;
  executar: (args: z.output<S>) => Promise<unknown>;
}): Acao {
  return { area: "geral", ...def } as Acao;
}

/** O app (ou a regra do MCP) recusou a ação. `status` é o HTTP da /api/v1. */
export class Recusa extends Error {
  status: number;
  detalhes?: unknown;
  constructor(mensagem: string, status = 422, detalhes?: unknown) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

// ─── Token ──────────────────────────────────────────────────────────────────

export function hashToken(bruto: string): string {
  return createHash("sha256").update(bruto).digest("hex");
}

export function tokenBemFormado(bruto: string): boolean {
  return new RegExp(`^${PREFIXO_TOKEN}[0-9a-f]{48}$`).test(bruto);
}

/** `Authorization: Bearer cf_mcp_…` ou `x-mcp-token: cf_mcp_…`. */
export function tokenDoPedido(headers: Headers): string {
  return (
    headers.get("x-mcp-token") ||
    (headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
  ).trim();
}

// ─── Permissão ──────────────────────────────────────────────────────────────

/** Ações que a pessoa enxerga: EVENTS_ONLY só eventos; sem escrita, só leitura. */
export function acoesVisiveis(acoes: Acao[], quem: Quem): Acao[] {
  return acoes.filter((a) => !barrada(a, quem));
}

function barrada(a: Acao, quem: Quem): string | null {
  if (quem.role === "EVENTS_ONLY" && a.area === "geral") {
    return "Seu papel (Eventos) só acessa eventos, como na tela.";
  }
  if (a.escrita && quem.role === "VIEWER") {
    return "Seu papel é Visualizador: somente leitura.";
  }
  if (a.escrita && !quem.podeEscrever) {
    return "Este token é só de leitura (ou a escrita do MCP está desligada em system_config.mcp_remoto).";
  }
  return null;
}

// ─── Execução ───────────────────────────────────────────────────────────────

export type Resultado =
  | { ok: true; dados: unknown }
  | { ok: false; erro: string; status: number; detalhes?: unknown };

export type Auditar = (r: {
  acao: string;
  args: unknown;
  ok: boolean;
  erro: string | null;
  ms: number;
}) => Promise<void>;

/** Valida, confere a permissão, executa e audita. Nunca lança. */
export async function rodarAcao(
  a: Acao,
  bruto: unknown,
  quem: Quem,
  auditar?: Auditar
): Promise<Resultado> {
  const t0 = Date.now();
  let r: Resultado;
  const v = a.schema.safeParse(bruto ?? {});
  if (!v.success) {
    r = {
      ok: false,
      erro: "Argumentos inválidos.",
      status: 400,
      detalhes: v.error.issues.map((i) => `${i.path.join(".") || "(corpo)"}: ${i.message}`),
    };
  } else {
    const motivo = barrada(a, quem);
    if (motivo) {
      r = { ok: false, erro: motivo, status: 403 };
    } else {
      try {
        r = { ok: true, dados: await a.executar(v.data as never) };
      } catch (e) {
        if (e instanceof Recusa) {
          r = { ok: false, erro: e.message, status: e.status, detalhes: e.detalhes };
        } else {
          console.error(`[mcp] ${a.nome}:`, e);
          r = { ok: false, erro: "Erro interno do Core Finance.", status: 500 };
        }
      }
    }
  }
  if (auditar) {
    await auditar({
      acao: a.nome,
      args: bruto,
      ok: r.ok,
      erro: r.ok ? null : r.erro,
      ms: Date.now() - t0,
    }).catch((e) => console.error("[mcp] auditoria:", e));
  }
  return r;
}

/** Argumentos para o mcp_calls: textos longos (ex.: arquivo em base64) cortados em 500. */
export function argsParaAuditoria(args: unknown): unknown {
  return JSON.parse(
    JSON.stringify(args ?? {}, (_k, v) =>
      typeof v === "string" && v.length > 500 ? `${v.slice(0, 500)}…` : v
    )
  );
}

export function textoSaida(dados: unknown): string {
  const t = typeof dados === "string" ? dados : JSON.stringify(dados, null, 2);
  return t.length > SAIDA_MAX
    ? `${t.slice(0, SAIDA_MAX)}\n…(cortado em ${SAIDA_MAX} caracteres: use page/limit ou filtros menores)`
    : t;
}

export function jsonSchemaDe(schema: z.ZodObject): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

// ─── MCP (JSON-RPC 2.0, Streamable HTTP sem estado) ────────────────────────

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export interface CtxRpc {
  acoes: Acao[];
  quem: Quem;
  instrucoes: string;
  auditar?: Auditar;
}

function rpcErro(id: Msg["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Responde uma mensagem; notificações (sem id) devolvem null. */
export async function atenderMensagem(msg: Msg, ctx: CtxRpc): Promise<object | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcErro(msg?.id, -32600, "Pedido JSON-RPC inválido.");
  }
  const notificacao = msg.id === undefined;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result });

  switch (msg.method) {
    case "initialize": {
      const pedido = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: PROTOCOLOS.includes(pedido) ? pedido : PROTOCOLOS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: NOME_SERVIDOR, version: VERSAO },
        instructions: ctx.instrucoes,
      });
    }
    case "ping":
      return notificacao ? null : ok({});
    case "tools/list":
      return ok({
        tools: acoesVisiveis(ctx.acoes, ctx.quem).map((a) => ({
          name: a.nome,
          description: a.descricao,
          inputSchema: jsonSchemaDe(a.schema),
          annotations: { readOnlyHint: !a.escrita, destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const nome = String(msg.params?.name ?? "");
      const a = ctx.acoes.find((x) => x.nome === nome);
      if (!a) return rpcErro(msg.id, -32602, `Ferramenta desconhecida: ${nome}`);
      const r = await rodarAcao(a, msg.params?.arguments ?? {}, ctx.quem, ctx.auditar);
      if (r.ok) return ok({ content: [{ type: "text", text: textoSaida(r.dados) }] });
      const det = r.detalhes ? `\n${textoSaida(r.detalhes)}` : "";
      return ok({ content: [{ type: "text", text: `Não deu: ${r.erro}${det}` }], isError: true });
    }
    default:
      if (notificacao || msg.method.startsWith("notifications/")) return null;
      return rpcErro(msg.id, -32601, `Método não suportado: ${msg.method}`);
  }
}

/** Corpo do POST /mcp: mensagem única ou lote. `null` = só notificações (HTTP 202). */
export async function atenderJsonRpc(corpo: unknown, ctx: CtxRpc): Promise<object | object[] | null> {
  if (Array.isArray(corpo)) {
    const rs = (await Promise.all(corpo.map((m) => atenderMensagem(m, ctx)))).filter(Boolean) as object[];
    return rs.length ? rs : null;
  }
  return atenderMensagem(corpo as Msg, ctx);
}

// ─── API REST (/api/v1) ─────────────────────────────────────────────────────

/** Tipo de base do campo, sem optional/nullable/default. */
function tipoBase(s: z.ZodType | undefined): string | undefined {
  let atual = s as { _zod?: { def: { type: string; innerType?: z.ZodType } } } | undefined;
  for (let i = 0; i < 10 && atual?._zod; i++) {
    const def = atual._zod.def;
    if (["optional", "nullable", "default", "prefault", "readonly"].includes(def.type) && def.innerType) {
      atual = def.innerType as typeof atual;
    } else return def.type;
  }
  return undefined;
}

/** Query string → argumentos, olhando o tipo de cada campo no schema. */
export function argsDaQuery(params: URLSearchParams, schema: z.ZodObject): Record<string, unknown> {
  const forma = schema.shape as Record<string, z.ZodType>;
  const args: Record<string, unknown> = {};
  for (const chave of new Set(params.keys())) {
    const vs = params.getAll(chave);
    const tipo = tipoBase(forma[chave]);
    const json = (v: string) => {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    };
    if (tipo === "array") {
      const primeiro = json(vs[0]);
      args[chave] = vs.length > 1 ? vs : Array.isArray(primeiro) ? primeiro : vs[0].split(",");
    } else if (tipo === "string" || tipo === "enum") {
      args[chave] = vs[0]; // telefone, busca e ids continuam texto
    } else if (tipo === "number" || tipo === "int") {
      args[chave] = vs[0] === "" ? undefined : Number(vs[0]);
    } else if (tipo === "boolean") {
      args[chave] = ["true", "1", "sim"].includes(vs[0].toLowerCase());
    } else {
      args[chave] = json(vs[0]);
    }
  }
  return args;
}

export async function atenderRest(p: {
  metodo: string;
  caminho: string;
  query: URLSearchParams;
  corpo: string;
  acoes: Acao[];
  quem: Quem;
  auditar?: Auditar;
}): Promise<{ status: number; body: unknown }> {
  const nome = p.caminho.replace(/^\/+|\/+$/g, "");
  if (!nome) {
    if (p.metodo !== "GET") return { status: 405, body: { ok: false, erro: "Use GET para listar as ações." } };
    return {
      status: 200,
      body: {
        ok: true,
        dados: acoesVisiveis(p.acoes, p.quem).map((a) => ({
          nome: a.nome,
          descricao: a.descricao,
          escrita: a.escrita,
          metodo: a.escrita ? "POST" : "GET ou POST",
          schema: jsonSchemaDe(a.schema),
        })),
      },
    };
  }
  const a = p.acoes.find((x) => x.nome === nome);
  if (!a) return { status: 404, body: { ok: false, erro: `Ação desconhecida: ${nome}. GET /api/v1 lista as ações.` } };

  let bruto: unknown;
  if (p.metodo === "GET") {
    if (a.escrita) return { status: 405, body: { ok: false, erro: `${nome} altera dados: use POST com corpo JSON.` } };
    bruto = argsDaQuery(p.query, a.schema);
  } else if (p.metodo === "POST") {
    try {
      bruto = p.corpo.trim() ? JSON.parse(p.corpo) : {};
    } catch {
      return { status: 400, body: { ok: false, erro: "Corpo não é JSON válido." } };
    }
  } else {
    return { status: 405, body: { ok: false, erro: "Use GET (leitura) ou POST." } };
  }

  const r = await rodarAcao(a, bruto, p.quem, p.auditar);
  if (r.ok) return { status: 200, body: { ok: true, dados: r.dados } };
  return {
    status: r.status,
    body: { ok: false, erro: r.erro, ...(r.detalhes !== undefined ? { detalhes: r.detalhes } : {}) },
  };
}
