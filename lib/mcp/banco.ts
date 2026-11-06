/**
 * Acesso genérico ao banco pelo MCP ("o que a tela não faz"), SEMPRE recortado
 * pela empresa do token.
 *
 * - Leitura (consultar, contar, agregar) em qualquer modelo de negócio.
 * - Escrita (criar, atualizar, apagar) só nos modelos de dados financeiros;
 *   equipe, convites, empresa e as tabelas do próprio MCP ficam de fora (têm
 *   ferramentas próprias com as checagens da tela).
 * - atualizar/apagar rodam primeiro em "prévia" (só contam); com confirmar=true
 *   executam. Filtro vazio é recusado (nada de "apagar tudo" sem querer).
 * - SQL cru (sqlLeitura) roda numa transação READ ONLY com timeout e NÃO tem
 *   recorte por empresa: por isso exige mcp_tokens.can_sql.
 *
 * As regras de negócio da tela (recorrência, folha, conciliação...) NÃO rodam
 * aqui. Para isso use as ferramentas da tela; isto é o "acesso direto".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Recusa } from "@/lib/mcp/nucleo";
import {
  camposDe,
  conferirRelacoes,
  ESCOPO,
  ESCREVE,
  LIMITE_LINHAS,
  limparDados,
  MODELOS,
  normalizarWhere,
  recortar,
  sqlPermitido,
} from "@/lib/mcp/banco-regras";

export { LIMITE_LINHAS, MODELOS, MODELOS_ESCRITA } from "@/lib/mcp/banco-regras";

type Campo = ReturnType<typeof camposDe>[number];

/**
 * Erro de filtro/dado montado pela IA (campo errado, tipo errado, SQL inválido)
 * volta como recusa com a mensagem do Prisma/Postgres, para ela corrigir.
 */
async function explicando<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const nome = (e as Error)?.name ?? "";
    if (/PrismaClient(Validation|KnownRequest)Error/.test(nome) || (e as { code?: string })?.code?.match?.(/^P\d{4}$|^[0-9A-Z]{5}$/)) {
      const msg = String((e as Error).message ?? e).split("\n").filter((l) => l.trim()).slice(-6).join("\n");
      throw new Recusa(`O banco recusou: ${msg}`, 400);
    }
    throw e;
  }
}

function delegate(modelo: string) {
  const nome = modelo.charAt(0).toLowerCase() + modelo.slice(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any)[nome] as Record<string, (args: unknown) => Promise<unknown>>;
}

/** Ids de relação (categoryId, accountId...) precisam ser da mesma empresa. */
async function conferirChaves(modelo: string, companyId: string, dados: Record<string, unknown>) {
  const campos = camposDe(modelo);
  const relacoes = campos.filter((c) => c.kind === "object") as (Campo & { relationFromFields?: string[] })[];
  for (const rel of relacoes) {
    const fk = rel.relationFromFields?.[0];
    if (!fk || !(fk in dados) || dados[fk] == null || fk === "companyId") continue;
    const alvo = rel.type;
    if (!ESCOPO[alvo]) continue;
    const achou = await delegate(alvo).findFirst({
      where: recortar(alvo, companyId, { id: dados[fk] }),
      select: { id: true },
    } as never);
    if (!achou) throw new Recusa(`${fk} ${String(dados[fk])} não existe nesta empresa.`, 422);
  }
}

// ─── Operações ───────────────────────────────────────────────────────────────

export function modelos() {
  const enums = Object.fromEntries(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));
  return {
    observacao:
      "Leitura em todos; escrita genérica só nos marcados escrita=true. Valores Decimal saem como texto. Datas aceitam AAAA-MM-DD.",
    modelos: MODELOS.map((nome) => ({
      nome,
      escrita: ESCREVE.has(nome),
      campos: camposDe(nome).map((c) => ({
        nome: c.name,
        tipo: c.kind === "object" ? `relação → ${c.type}${c.isList ? "[]" : ""}` : `${c.type}${c.isList ? "[]" : ""}`,
        obrigatorio: c.isRequired && !c.hasDefaultValue && c.kind !== "object",
      })),
    })),
    enums,
  };
}

async function consultarCru(
  companyId: string,
  a: {
    modelo: string;
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
    skip?: number;
  }
) {
  if (a.select && a.include) throw new Recusa("Use select OU include, não os dois.", 400);
  conferirRelacoes(a.modelo, a.select);
  conferirRelacoes(a.modelo, a.include);
  const take = Math.min(a.take ?? 50, LIMITE_LINHAS);
  const where = recortar(a.modelo, companyId, normalizarWhere(a.modelo, a.where));
  const d = delegate(a.modelo);
  const [linhas, total] = await Promise.all([
    d.findMany({
      where,
      ...(a.select ? { select: a.select } : {}),
      ...(a.include ? { include: a.include } : {}),
      ...(a.orderBy ? { orderBy: a.orderBy } : {}),
      take,
      skip: a.skip ?? 0,
    } as never),
    d.count({ where } as never),
  ]);
  return { total, take, skip: a.skip ?? 0, linhas };
}

async function contarCru(companyId: string, a: { modelo: string; where?: Record<string, unknown> }) {
  const where = recortar(a.modelo, companyId, normalizarWhere(a.modelo, a.where));
  return { total: await delegate(a.modelo).count({ where } as never) };
}

async function agregarCru(
  companyId: string,
  a: {
    modelo: string;
    where?: Record<string, unknown>;
    by?: string[];
    sum?: string[];
    avg?: string[];
    min?: string[];
    max?: string[];
    orderBy?: unknown;
    take?: number;
  }
) {
  const where = recortar(a.modelo, companyId, normalizarWhere(a.modelo, a.where));
  const sel = (xs?: string[]) => (xs?.length ? Object.fromEntries(xs.map((x) => [x, true])) : undefined);
  const ops = {
    ...(sel(a.sum) ? { _sum: sel(a.sum) } : {}),
    ...(sel(a.avg) ? { _avg: sel(a.avg) } : {}),
    ...(sel(a.min) ? { _min: sel(a.min) } : {}),
    ...(sel(a.max) ? { _max: sel(a.max) } : {}),
    _count: true,
  };
  const d = delegate(a.modelo);
  if (a.by?.length) {
    return d.groupBy({
      by: a.by,
      where,
      ...ops,
      ...(a.orderBy ? { orderBy: a.orderBy } : {}),
      take: Math.min(a.take ?? 200, LIMITE_LINHAS),
    } as never);
  }
  return d.aggregate({ where, ...ops } as never);
}

async function criarCru(companyId: string, a: { modelo: string; dados: Record<string, unknown> | Record<string, unknown>[] }) {
  if (!ESCREVE.has(a.modelo)) throw new Recusa(`${a.modelo} não aceita escrita genérica: use a ferramenta da tela.`, 403);
  const lista = Array.isArray(a.dados) ? a.dados : [a.dados];
  if (lista.length === 0) throw new Recusa("Nada para criar.", 400);
  if (lista.length > LIMITE_LINHAS) throw new Recusa(`Máximo ${LIMITE_LINHAS} registros por chamada.`, 400);

  const e = ESCOPO[a.modelo];
  const prontos = [];
  for (const bruto of lista) {
    const dados = limparDados(a.modelo, bruto, "criar");
    await conferirChaves(a.modelo, companyId, dados);
    if (e.tipo === "via" && !dados[e.fk]) throw new Recusa(`${e.fk} é obrigatório em ${a.modelo}.`, 400);
    prontos.push(e.tipo === "direto" ? { ...dados, companyId } : dados);
  }

  const d = delegate(a.modelo);
  const criados = await prisma.$transaction(prontos.map((data) => d.create({ data } as never) as never));
  return { criados: criados.length, registros: criados };
}

async function previa(modelo: string, where: Record<string, unknown>) {
  const d = delegate(modelo);
  const [total, amostra] = await Promise.all([
    d.count({ where } as never),
    d.findMany({ where, take: 10 } as never),
  ]);
  return { total, amostra };
}

function exigirFiltro(where?: Record<string, unknown>) {
  if (!where || Object.keys(where).length === 0) {
    throw new Recusa("Informe um filtro (where) não vazio. Para tudo, filtre explicitamente (ex.: { id: { not: '' } }).", 400);
  }
}

async function atualizarCru(
  companyId: string,
  a: { modelo: string; where: Record<string, unknown>; dados: Record<string, unknown>; confirmar?: boolean }
) {
  if (!ESCREVE.has(a.modelo)) throw new Recusa(`${a.modelo} não aceita escrita genérica: use a ferramenta da tela.`, 403);
  exigirFiltro(a.where);
  const dados = limparDados(a.modelo, a.dados, "atualizar");
  if (Object.keys(dados).length === 0) throw new Recusa("Nada para atualizar.", 400);
  await conferirChaves(a.modelo, companyId, dados);
  const where = recortar(a.modelo, companyId, normalizarWhere(a.modelo, a.where));

  if (!a.confirmar) {
    const p = await previa(a.modelo, where);
    return { previa: true, seriamAtualizados: p.total, amostra: p.amostra, dados, comoExecutar: "repita com confirmar: true" };
  }
  const r = (await delegate(a.modelo).updateMany({ where, data: dados } as never)) as { count: number };
  return { atualizados: r.count };
}

async function apagarCru(companyId: string, a: { modelo: string; where: Record<string, unknown>; confirmar?: boolean }) {
  if (!ESCREVE.has(a.modelo)) throw new Recusa(`${a.modelo} não aceita escrita genérica: use a ferramenta da tela.`, 403);
  exigirFiltro(a.where);
  const where = recortar(a.modelo, companyId, normalizarWhere(a.modelo, a.where));
  if (!a.confirmar) {
    const p = await previa(a.modelo, where);
    return { previa: true, seriamApagados: p.total, amostra: p.amostra, comoExecutar: "repita com confirmar: true" };
  }
  const r = (await delegate(a.modelo).deleteMany({ where } as never)) as { count: number };
  return { apagados: r.count };
}

// ─── SQL somente leitura ─────────────────────────────────────────────────────

function semBigInt(v: unknown): unknown {
  return JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? (Number.isSafeInteger(Number(x)) ? Number(x) : x.toString()) : x))
  );
}

async function sqlLeituraCru(sql: string, maxLinhas = 1000) {
  const motivo = sqlPermitido(sql);
  if (motivo) throw new Recusa(motivo, 400);
  const texto = sql.trim().replace(/;+\s*$/, "");
  const linhas = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'");
    return tx.$queryRawUnsafe<unknown[]>(texto);
  });
  const lim = Math.min(maxLinhas, 5000);
  return {
    linhas: semBigInt(linhas.slice(0, lim)),
    total: linhas.length,
    cortado: linhas.length > lim,
  };
}

export const consultar = (...a: Parameters<typeof consultarCru>) => explicando(() => consultarCru(...a));
export const contar = (...a: Parameters<typeof contarCru>) => explicando(() => contarCru(...a));
export const agregar = (...a: Parameters<typeof agregarCru>) => explicando(() => agregarCru(...a));
export const criar = (...a: Parameters<typeof criarCru>) => explicando(() => criarCru(...a));
export const atualizar = (...a: Parameters<typeof atualizarCru>) => explicando(() => atualizarCru(...a));
export const apagar = (...a: Parameters<typeof apagarCru>) => explicando(() => apagarCru(...a));
export const sqlLeitura = (...a: Parameters<typeof sqlLeituraCru>) => explicando(() => sqlLeituraCru(...a));
