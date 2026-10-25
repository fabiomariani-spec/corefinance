// Testes do núcleo do MCP / API v1 (lib/mcp/nucleo.ts), sem banco nem Next.
// Rodar: npm run test:mcp   (node --test; o Node 22.18+ lê .ts direto)
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  acao,
  argsDaQuery,
  argsParaAuditoria,
  atenderJsonRpc,
  atenderRest,
  hashToken,
  Recusa,
  rodarAcao,
  SAIDA_MAX,
  textoSaida,
  tokenBemFormado,
  tokenDoPedido,
} from "../lib/mcp/nucleo.ts";

const chamadas = [];
const ACOES = [
  acao({
    nome: "listar_coisas",
    descricao: "lista",
    schema: z.object({ status: z.array(z.enum(["A", "B"])).optional(), limit: z.number().optional(), search: z.string().optional(), ativo: z.boolean().optional() }),
    escrita: false,
    executar: async (a) => ({ recebi: a }),
  }),
  acao({
    nome: "criar_coisa",
    descricao: "cria",
    schema: z.object({ name: z.string().min(1) }),
    escrita: true,
    executar: async (a) => {
      chamadas.push(a);
      return { id: "1", ...a };
    },
  }),
  acao({
    nome: "recusada",
    descricao: "o app recusa",
    schema: z.object({}),
    escrita: false,
    executar: async () => {
      throw new Recusa("status errado");
    },
  }),
  acao({
    nome: "quebra",
    descricao: "erro interno",
    schema: z.object({}),
    escrita: false,
    executar: async () => {
      throw new Error("segredo do banco");
    },
  }),
  acao({ nome: "ver_evento", descricao: "evento", schema: z.object({}), escrita: false, area: "eventos", executar: async () => "ok" }),
];

const ADMIN = { role: "ADMIN", podeEscrever: true };
const LEITURA = { role: "ADMIN", podeEscrever: false };
const VIEWER = { role: "VIEWER", podeEscrever: true };
const EVENTOS = { role: "EVENTS_ONLY", podeEscrever: true };
const ctx = (quem, auditar) => ({ acoes: ACOES, quem, instrucoes: "oi", auditar });

test("token: formato cf_mcp_ + 48 hex, sha256 e headers", () => {
  const bom = "cf_mcp_" + "a".repeat(48);
  assert.equal(tokenBemFormado(bom), true);
  assert.equal(tokenBemFormado("cf_mcp_" + "a".repeat(47)), false);
  assert.equal(tokenBemFormado("cu_mcp_" + "a".repeat(48)), false);
  assert.equal(tokenBemFormado("cf_mcp_" + "G".repeat(48)), false);
  assert.match(hashToken(bom), /^[0-9a-f]{64}$/);
  assert.equal(tokenDoPedido(new Headers({ authorization: `Bearer ${bom}` })), bom);
  assert.equal(tokenDoPedido(new Headers({ "x-mcp-token": bom })), bom);
  assert.equal(tokenDoPedido(new Headers()), "");
});

test("initialize devolve servidor, versão e protocolo pedido", async () => {
  const r = await atenderJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ctx(ADMIN));
  assert.equal(r.result.serverInfo.name, "core-finance");
  assert.equal(r.result.protocolVersion, "2025-03-26");
  assert.ok(r.result.capabilities.tools);
  const r2 = await atenderJsonRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx(ADMIN));
  assert.equal(r2.result.protocolVersion, "2025-06-18");
});

test("notificação não tem resposta; lote responde só o que tem id", async () => {
  assert.equal(await atenderJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx(ADMIN)), null);
  const lote = await atenderJsonRpc(
    [{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 9, method: "ping" }],
    ctx(ADMIN)
  );
  assert.deepEqual(lote, [{ jsonrpc: "2.0", id: 9, result: {} }]);
});

test("tools/list: schema JSON, anotações e filtro por papel/escrita", async () => {
  const nomes = async (quem) =>
    (await atenderJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx(quem))).result.tools.map((t) => t.name);
  const r = await atenderJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx(ADMIN));
  const criar = r.result.tools.find((t) => t.name === "criar_coisa");
  assert.equal(criar.inputSchema.type, "object");
  assert.deepEqual(criar.inputSchema.required, ["name"]);
  assert.equal(criar.annotations.readOnlyHint, false);
  assert.equal(criar.annotations.destructiveHint, false);
  assert.equal(r.result.tools.find((t) => t.name === "listar_coisas").annotations.readOnlyHint, true);
  assert.ok(!(await nomes(LEITURA)).includes("criar_coisa"));
  assert.ok(!(await nomes(VIEWER)).includes("criar_coisa"));
  assert.deepEqual(await nomes(EVENTOS), ["ver_evento"]);
});

test("tools/call: sucesso, validação, recusa, erro interno sem vazar e ferramenta desconhecida", async () => {
  const call = (name, args, quem = ADMIN) =>
    atenderJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, ctx(quem));
  const ok = await call("criar_coisa", { name: "x" });
  assert.equal(ok.result.isError, undefined);
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { id: "1", name: "x" });
  const inval = await call("criar_coisa", { name: "" });
  assert.equal(inval.result.isError, true);
  assert.match(inval.result.content[0].text, /Argumentos inválidos/);
  assert.match((await call("recusada", {})).result.content[0].text, /status errado/);
  const quebra = await call("quebra", {});
  assert.doesNotMatch(quebra.result.content[0].text, /segredo/);
  assert.equal((await call("nao_existe", {})).error.code, -32602);
});

test("escrita: barrada sem can_write, para VIEWER e fora da área do EVENTS_ONLY", async () => {
  chamadas.length = 0;
  for (const quem of [LEITURA, VIEWER, EVENTOS]) {
    const r = await rodarAcao(ACOES[1], { name: "x" }, quem);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
  }
  assert.equal(chamadas.length, 0, "não executou");
  assert.equal((await rodarAcao(ACOES[4], {}, EVENTOS)).ok, true);
});

test("auditoria: uma linha por chamada, com ok/erro e args cortados", async () => {
  const linhas = [];
  const auditar = async (l) => void linhas.push(l);
  await rodarAcao(ACOES[1], { name: "x" }, ADMIN, auditar);
  await rodarAcao(ACOES[1], { name: "x" }, LEITURA, auditar);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].ok, true);
  assert.equal(linhas[1].ok, false);
  assert.match(linhas[1].erro, /só de leitura/);
  const cortado = argsParaAuditoria({ arquivo: "a".repeat(2000) });
  assert.equal(cortado.arquivo.length, 501);
  // auditoria que falha não derruba a ação
  const r = await rodarAcao(ACOES[1], { name: "y" }, ADMIN, async () => {
    throw new Error("banco fora");
  });
  assert.equal(r.ok, true);
});

test("saída cortada em ~60 mil caracteres com aviso", () => {
  const t = textoSaida("x".repeat(SAIDA_MAX + 10));
  assert.ok(t.length < SAIDA_MAX + 200);
  assert.match(t, /cortado/);
});

test("query string vira argumentos pelo tipo do schema", () => {
  const schema = ACOES[0].schema;
  assert.deepEqual(argsDaQuery(new URLSearchParams("status=A&status=B&limit=5&search=123&ativo=1"), schema), {
    status: ["A", "B"],
    limit: 5,
    search: "123",
    ativo: true,
  });
  assert.deepEqual(argsDaQuery(new URLSearchParams("status=A,B"), schema), { status: ["A", "B"] });
  assert.deepEqual(argsDaQuery(new URLSearchParams('status=["B"]'), schema), { status: ["B"] });
});

test("REST: lista, GET de leitura, POST de escrita e os códigos de erro", async () => {
  const rest = (metodo, caminho, { query = "", corpo = "", quem = ADMIN } = {}) =>
    atenderRest({ metodo, caminho, query: new URLSearchParams(query), corpo, acoes: ACOES, quem });

  const lista = await rest("GET", "");
  assert.equal(lista.status, 200);
  assert.ok(lista.body.dados.some((a) => a.nome === "criar_coisa" && a.escrita && a.metodo === "POST"));

  const ler = await rest("GET", "listar_coisas", { query: "limit=3" });
  assert.deepEqual(ler, { status: 200, body: { ok: true, dados: { recebi: { limit: 3 } } } });

  assert.equal((await rest("GET", "criar_coisa")).status, 405);
  assert.equal((await rest("POST", "criar_coisa", { corpo: '{"name":"z"}' })).status, 200);
  assert.equal((await rest("POST", "criar_coisa", { corpo: "{" })).status, 400);
  assert.equal((await rest("POST", "criar_coisa", { corpo: "{}" })).status, 400);
  assert.equal((await rest("POST", "criar_coisa", { corpo: '{"name":"z"}', quem: LEITURA })).status, 403);
  assert.equal((await rest("GET", "recusada")).status, 422);
  assert.equal((await rest("GET", "quebra")).status, 500);
  assert.equal((await rest("GET", "nao_existe")).status, 404);
  assert.equal((await rest("DELETE", "listar_coisas")).status, 405);
});

test("registro real (lib/mcp/acoes.ts): nomes únicos, em snake_case e nenhum de apagar", async () => {
  const { readFile } = await import("node:fs/promises");
  const fonte = await readFile(new URL("../lib/mcp/acoes.ts", import.meta.url), "utf8");
  const nomes = [...fonte.matchAll(/nome: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(nomes.length >= 40, `só ${nomes.length} ações`);
  assert.equal(new Set(nomes).size, nomes.length, "nome repetido");
  for (const n of nomes) {
    assert.match(n, /^[a-z][a-z_]+$/);
    assert.doesNotMatch(n, /apagar|excluir|remover|deletar/);
  }
  assert.ok(nomes.includes("quem_sou_eu"));
  assert.equal((fonte.match(/metodo: "DELETE"/g) ?? []).length, 1, "DELETE só no revogar_convite (expira convite)");
});
