/**
 * Regras puras do acesso genérico ao banco (lib/mcp/banco.ts): recorte por
 * empresa, limpeza de dados, datas e filtro do SQL. Sem banco nem Next, para
 * testar com `node --test` (tests/mcp.test.mjs). Por isso não importa nada do
 * projeto: a recusa é uma RecusaBanco, que o núcleo trata como Recusa.
 */
import { Prisma } from "@prisma/client";

export class RecusaBanco extends Error {
  status: number;
  recusa = true as const;
  constructor(mensagem: string, status = 422) {
    super(mensagem);
    this.status = status;
  }
}

type Escopo =
  | { tipo: "direto" } // tem coluna companyId
  | { tipo: "empresa" } // a própria empresa (id = companyId)
  | { tipo: "via"; relacao: string; fk: string; pai: string }; // herda do pai

/** Modelos expostos. Os de fora (McpToken, McpCall, SystemConfig) nunca aparecem. */
export const ESCOPO: Record<string, Escopo> = {
  Company: { tipo: "empresa" },
  CompanyUser: { tipo: "direto" },
  Invite: { tipo: "direto" },
  Account: { tipo: "direto" },
  CreditCard: { tipo: "direto" },
  Category: { tipo: "direto" },
  Department: { tipo: "direto" },
  Contact: { tipo: "direto" },
  Transaction: { tipo: "direto" },
  Attachment: { tipo: "via", relacao: "transaction", fk: "transactionId", pai: "Transaction" },
  CreditCardInvoice: { tipo: "direto" },
  InvoiceJob: { tipo: "direto" },
  InvoiceItem: { tipo: "via", relacao: "invoice", fk: "invoiceId", pai: "CreditCardInvoice" },
  Event: { tipo: "direto" },
  EventItem: { tipo: "direto" },
  Employee: { tipo: "direto" },
  VariableCompensation: { tipo: "direto" },
};

/** Escrita genérica liberada (equipe/empresa/convites só pelas ferramentas da tela). */
export const ESCREVE = new Set([
  "Account",
  "CreditCard",
  "Category",
  "Department",
  "Contact",
  "Transaction",
  "Attachment",
  "CreditCardInvoice",
  "InvoiceItem",
  "Event",
  "EventItem",
  "Employee",
  "VariableCompensation",
]);

export const MODELOS = Object.keys(ESCOPO) as [string, ...string[]];
export const MODELOS_ESCRITA = [...ESCREVE] as [string, ...string[]];

export const LIMITE_LINHAS = 500;

type Campo = { name: string; kind: string; type: string; isList: boolean; isRequired: boolean; hasDefaultValue?: boolean };

export function camposDe(modelo: string): Campo[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelo);
  if (!m) throw new RecusaBanco(`Modelo desconhecido: ${modelo}`, 400);
  return m.fields as unknown as Campo[];
}

// ─── Recorte por empresa ─────────────────────────────────────────────────────

/** where do usuário AND o recorte da empresa (o recorte não dá pra burlar). */
export function recortar(modelo: string, companyId: string, where: Record<string, unknown> = {}) {
  const e = ESCOPO[modelo];
  if (!e) throw new RecusaBanco(`Modelo fora do MCP: ${modelo}`, 400);
  const corte =
    e.tipo === "direto"
      ? { companyId }
      : e.tipo === "empresa"
        ? { id: companyId }
        : { [e.relacao]: { companyId } };
  return Object.keys(where).length ? { AND: [where, corte] } : corte;
}

// ─── Datas "AAAA-MM-DD" em campos DateTime ──────────────────────────────────

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Em dados gravados: meio-dia, como a tela faz (evita virar o dia no fuso BR). */
function dataGravada(v: unknown) {
  return typeof v === "string" && SO_DATA.test(v) ? new Date(`${v}T12:00:00`) : v;
}

/** Em filtros: gte/gt = início do dia, lte = fim do dia, lt = início do dia. */
function dataFiltro(op: string, v: unknown) {
  if (typeof v !== "string" || !SO_DATA.test(v)) return v;
  if (op === "lte") return new Date(`${v}T23:59:59.999Z`);
  if (op === "equals") return new Date(`${v}T12:00:00`);
  return new Date(`${v}T00:00:00.000Z`);
}

export function normalizarWhere(modelo: string, where: unknown): Record<string, unknown> {
  if (!where || typeof where !== "object" || Array.isArray(where)) return {};
  const datas = new Set(camposDe(modelo).filter((c) => c.type === "DateTime").map((c) => c.name));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(where as Record<string, unknown>)) {
    if ((k === "AND" || k === "OR" || k === "NOT") && Array.isArray(v)) {
      out[k] = v.map((x) => normalizarWhere(modelo, x));
    } else if ((k === "AND" || k === "NOT") && v && typeof v === "object") {
      out[k] = normalizarWhere(modelo, v);
    } else if (datas.has(k)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([op, x]) => [op, dataFiltro(op, x)]));
      } else {
        out[k] = dataFiltro("equals", v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Dados para criar/atualizar: só campos escalares/enum do modelo (nada de
 * escrita aninhada em relações, que escaparia do recorte), sem id/companyId/
 * timestamps, datas AAAA-MM-DD convertidas.
 */
export function limparDados(modelo: string, dados: unknown, modo: "criar" | "atualizar"): Record<string, unknown> {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw new RecusaBanco("dados precisa ser um objeto { campo: valor }.", 400);
  }
  const campos = new Map(camposDe(modelo).map((c) => [c.name, c]));
  const proibidos = new Set(["companyId", "createdAt", "updatedAt", ...(modo === "atualizar" ? ["id"] : [])]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
    const c = campos.get(k);
    if (!c) throw new RecusaBanco(`${modelo} não tem o campo "${k}". Veja banco_modelos.`, 400);
    if (proibidos.has(k)) throw new RecusaBanco(`O campo "${k}" é controlado pelo sistema.`, 400);
    if (c.kind === "object") {
      throw new RecusaBanco(`"${k}" é relação: use o id (ex.: ${k}Id), não um objeto aninhado.`, 400);
    }
    out[k] = c.type === "DateTime" ? dataGravada(v) : v;
  }
  return out;
}

const MODELOS_OCULTOS = new Set(["McpToken", "McpCall", "SystemConfig"]);

/** select/include não podem atravessar relações para as tabelas do MCP (hash de token, auditoria). */
export function conferirRelacoes(modelo: string, arvore: unknown) {
  if (!arvore || typeof arvore !== "object") return;
  const campos = new Map(camposDe(modelo).map((c) => [c.name, c]));
  for (const [k, v] of Object.entries(arvore as Record<string, unknown>)) {
    if (k === "_count") continue;
    const c = campos.get(k);
    if (!c) throw new RecusaBanco(`${modelo} não tem o campo "${k}".`, 400);
    if (c.kind !== "object") continue;
    if (MODELOS_OCULTOS.has(c.type)) throw new RecusaBanco(`Relação "${k}" não é exposta pelo MCP.`, 403);
    if (v && typeof v === "object") {
      const sub = v as Record<string, unknown>;
      conferirRelacoes(c.type, sub.select);
      conferirRelacoes(c.type, sub.include);
    }
  }
}

// ─── SQL somente leitura ─────────────────────────────────────────────────────

const PROIBIDO_SQL = /\b(pg_terminate_backend|pg_cancel_backend|pg_sleep|dblink|lo_import|lo_export|pg_read_file|pg_read_binary_file|pg_ls_dir|copy|set\s+role|set\s+session)\b/i;

/** Tabelas do próprio MCP (hash de token, auditoria, chave geral) ficam fora do SQL. */
const TABELAS_MCP = /\b(mcp_tokens|mcp_calls|system_config)\b/i;

export function sqlPermitido(sql: string): string | null {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!s) return "SQL vazio.";
  if (s.includes(";")) return "Um comando por vez (sem ';' no meio).";
  if (!/^(select|with|explain|table|values)\b/i.test(s)) return "Só leitura: comece com SELECT, WITH, EXPLAIN, TABLE ou VALUES.";
  if (PROIBIDO_SQL.test(s)) return "Função/comando bloqueado no SQL do MCP.";
  if (TABELAS_MCP.test(s)) return "As tabelas do MCP não são consultáveis por aqui (use ver_auditoria_mcp).";
  return null;
}

