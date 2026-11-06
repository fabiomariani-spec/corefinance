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
  CONFIRMAR,
} from "../lib/mcp/nucleo.ts";
import {
  conferirRelacoes,
  ESCREVE,
  limparDados,
  normalizarWhere,
  recortar,
  RecusaBanco,
  sqlPermitido,
} from "../lib/mcp/banco-regras.ts";

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

// A regra mudou em 06/11/2026: o João pediu o MCP 100% completo, inclusive
// apagar. No lugar de "nenhuma ação de apagar", a trava agora é: toda ação que
// apaga/desativa é marcada (apaga: true → destructiveHint) e exige confirmar.
async function blocosDoRegistro() {
  const { readFile } = await import("node:fs/promises");
  const fonte = await readFile(new URL("../lib/mcp/acoes.ts", import.meta.url), "utf8");
  const corpo = fonte.slice(fonte.indexOf("export const ACOES"));
  return { fonte, blocos: corpo.split(/\n  acao\(\{\n/).slice(1) };
}

test("registro real (lib/mcp/acoes.ts): nomes únicos, snake_case e toda ação que apaga é marcada e pede confirmar", async () => {
  const { blocos } = await blocosDoRegistro();
  const nomes = blocos.map((b) => b.match(/nome: "([^"]+)"/)[1]);
  assert.ok(nomes.length >= 80, `só ${nomes.length} ações`);
  assert.equal(new Set(nomes).size, nomes.length, "nome repetido");
  for (const [i, b] of blocos.entries()) {
    const n = nomes[i];
    assert.match(n, /^[a-z][a-z_]+$/);
    const usaDelete = /metodo: "DELETE"/.test(b) || /\.(apagar)\(/.test(b);
    const nomeApaga = /^(excluir|desativar|zerar|remover|banco_apagar)/.test(n);
    if (usaDelete || nomeApaga) {
      if (n === "revogar_convite") continue; // expira convite: reversível com convidar_membro
      assert.match(b, /apaga: true/, `${n} apaga e não está marcada com apaga: true`);
      assert.match(b, /confirmar: (CONFIRMAR|z\.boolean)/, `${n} apaga e não pede confirmar`);
    }
  }
  for (const n of ["quem_sou_eu", "excluir_lancamento", "excluir_empresa", "banco_consultar", "sql_leitura", "exportar_lancamentos_csv"]) {
    assert.ok(nomes.includes(n), `falta ${n}`);
  }
});

// Toda rota de app/api usada pela tela vira ação; as que não viram estão aqui
// com o motivo. Rota nova sem ação (e sem entrar aqui) quebra o teste.
const FORA_DO_MCP = {
  "/api/accounts/[id] PUT": "editar_conta usa o PATCH (parcial), que faz o mesmo",
  "/api/credit-cards/[id] PUT": "editar_cartao usa o PATCH (parcial)",
  "/api/categories/[id] PUT": "editar_categoria usa o PATCH (parcial)",
  "/api/cron/daily-report GET": "disparo do cron; o texto sai em relatorio_diario",
  "/api/cron/weekly-report GET": "disparo do cron; o texto sai em relatorio_semanal",
  "/api/debug/me GET": "diagnóstico da sessão por cookie; equivalente: quem_sou_eu",
  "/api/health GET": "saúde da infraestrutura",
  "/api/setup POST": "primeiro acesso de quem ainda não tem empresa (depende do cookie); equivalente: criar_empresa",
  "/api/team/invite/[token] GET": "tela pública do convite, de quem recebe",
  "/api/team/invite/[token] POST": "aceite do convite pelo convidado logado",
  "/api/webhooks/revenue POST": "entrada do webhook da plataforma de vendas",
  "/api/whatsapp/webhook GET": "verificação do webhook do WhatsApp",
  "/api/whatsapp/webhook POST": "entrada de mensagens do WhatsApp; equivalente: perguntar_assistente",
  "/api/v1/[[...acao]] GET": "é a própria porta REST do MCP (serve as ações daqui)",
  "/api/v1/[[...acao]] POST": "é a própria porta REST do MCP (serve as ações daqui)",
};

test("cobertura: toda rota+método de app/api tem ação no MCP ou motivo em FORA_DO_MCP", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const raiz = new URL("../app/api/", import.meta.url).pathname;
  const rotas = [];
  async function andar(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await andar(p);
      else if (e.name === "route.ts") {
        const src = await readFile(p, "utf8");
        const caminho = "/api/" + p.slice(raiz.length).replace(/\/route\.ts$/, "");
        for (const m of src.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)) rotas.push(`${caminho} ${m[1]}`);
      }
    }
  }
  await andar(raiz);
  assert.ok(rotas.length > 50, `só achei ${rotas.length} rotas`);

  const { fonte } = await blocosDoRegistro();
  const apelido = new Map([...fonte.matchAll(/import \* as (\w+) from "@\/app(\/api\/[^"]+)\/route"/g)].map((m) => [m[1], m[2]]));
  const usadas = new Set([...fonte.matchAll(/chamar(?:<[^>]*>)?\((\w+)\.(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => `${apelido.get(m[1])} ${m[2]}`));

  const faltando = rotas.filter((r) => !usadas.has(r) && !FORA_DO_MCP[r]);
  assert.deepEqual(faltando, [], "rotas sem ação no MCP (crie a ação ou justifique em FORA_DO_MCP)");
  const sobrando = Object.keys(FORA_DO_MCP).filter((r) => !rotas.includes(r) || usadas.has(r));
  assert.deepEqual(sobrando, [], "FORA_DO_MCP com rota que não existe mais ou que já tem ação");
});

test("apagar: destructiveHint na lista e confirmar=true obrigatório", async () => {
  const apagadas = [];
  const acoes = [
    acao({
      nome: "excluir_coisa",
      descricao: "apaga",
      schema: z.object({ id: z.string(), confirmar: CONFIRMAR }),
      escrita: true,
      apaga: true,
      executar: async (a) => void apagadas.push(a.id),
    }),
  ];
  const lista = await atenderJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { acoes, quem: ADMIN, instrucoes: "" });
  const t = lista.result.tools[0];
  assert.equal(t.annotations.destructiveHint, true);
  assert.ok(t.inputSchema.required.includes("confirmar"));
  assert.equal((await rodarAcao(acoes[0], { id: "1" }, ADMIN)).status, 400);
  assert.equal((await rodarAcao(acoes[0], { id: "1", confirmar: false }, ADMIN)).status, 400);
  assert.deepEqual(apagadas, [], "não apagou sem confirmar");
  assert.equal((await rodarAcao(acoes[0], { id: "1", confirmar: true }, ADMIN)).ok, true);
  assert.deepEqual(apagadas, ["1"]);
});

test("soAdmin e sql: barradas para quem não é ADMIN ou não tem can_sql, e somem da lista", async () => {
  const acoes = [
    acao({ nome: "so_admin", descricao: "", schema: z.object({}), escrita: false, soAdmin: true, executar: async () => "ok" }),
    acao({ nome: "sql_x", descricao: "", schema: z.object({}), escrita: false, soAdmin: true, sql: true, executar: async () => "ok" }),
  ];
  const MANAGER = { role: "MANAGER", podeEscrever: true, podeSql: true };
  const ADMIN_SQL = { role: "ADMIN", podeEscrever: true, podeSql: true };
  assert.equal((await rodarAcao(acoes[0], {}, MANAGER)).status, 403);
  assert.equal((await rodarAcao(acoes[0], {}, ADMIN)).ok, true);
  assert.equal((await rodarAcao(acoes[1], {}, ADMIN)).status, 403, "ADMIN sem can_sql");
  assert.equal((await rodarAcao(acoes[1], {}, MANAGER)).status, 403, "can_sql sem ADMIN");
  assert.equal((await rodarAcao(acoes[1], {}, ADMIN_SQL)).ok, true);
  const nomes = (await atenderJsonRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { acoes, quem: ADMIN, instrucoes: "" }))
    .result.tools.map((x) => x.name);
  assert.deepEqual(nomes, ["so_admin"]);
});

test("RecusaBanco (lib/mcp/banco-regras.ts) vira recusa com status, não erro interno", async () => {
  const a = acao({
    nome: "banco_x",
    descricao: "",
    schema: z.object({}),
    escrita: false,
    executar: async () => {
      throw new RecusaBanco("Transaction não tem o campo \"x\"", 400);
    },
  });
  const r = await rodarAcao(a, {}, ADMIN);
  assert.equal(r.status, 400);
  assert.match(r.erro, /não tem o campo/);
});

test("banco: recorte por empresa em cada tipo de modelo, sem dar pra burlar pelo where", () => {
  assert.deepEqual(recortar("Transaction", "emp1"), { companyId: "emp1" });
  assert.deepEqual(recortar("Transaction", "emp1", { companyId: "emp2" }), { AND: [{ companyId: "emp2" }, { companyId: "emp1" }] });
  assert.deepEqual(recortar("Company", "emp1"), { id: "emp1" });
  assert.deepEqual(recortar("InvoiceItem", "emp1", { amount: { gt: 1 } }), {
    AND: [{ amount: { gt: 1 } }, { invoice: { companyId: "emp1" } }],
  });
  assert.deepEqual(recortar("Attachment", "emp1"), { transaction: { companyId: "emp1" } });
  assert.throws(() => recortar("McpToken", "emp1"), /fora do MCP/);
  assert.throws(() => recortar("SystemConfig", "emp1"), /fora do MCP/);
  for (const m of ["CompanyUser", "Invite", "Company", "InvoiceJob"]) assert.ok(!ESCREVE.has(m), `${m} não pode ter escrita genérica`);
});

test("banco: dados limpos (sem companyId, sem relação aninhada, campo inexistente) e datas ao meio-dia", () => {
  const d = limparDados("Transaction", { description: "x", amount: 10, dueDate: "2026-11-06", tags: ["a"] }, "criar");
  assert.equal(d.dueDate.toISOString().slice(0, 10), "2026-11-06");
  assert.equal(d.dueDate.getHours(), 12);
  assert.deepEqual(d.tags, ["a"]);
  assert.throws(() => limparDados("Transaction", { companyId: "outra" }, "criar"), /controlado pelo sistema/);
  assert.throws(() => limparDados("Transaction", { id: "x" }, "atualizar"), /controlado pelo sistema/);
  assert.throws(() => limparDados("Transaction", { category: { connect: { id: "c" } } }, "criar"), /relação/);
  assert.throws(() => limparDados("Transaction", { naoExiste: 1 }, "criar"), /não tem o campo/);
  assert.throws(() => limparDados("Transaction", [1], "criar"), /objeto/);
});

test("banco: datas AAAA-MM-DD nos filtros cobrem o dia inteiro, inclusive dentro de AND/OR", () => {
  const w = normalizarWhere("Transaction", {
    dueDate: { gte: "2026-11-01", lte: "2026-11-30" },
    OR: [{ paymentDate: { lt: "2026-12-01" } }],
    description: "2026-11-01",
  });
  assert.equal(w.dueDate.gte.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(w.dueDate.lte.toISOString(), "2026-11-30T23:59:59.999Z");
  assert.equal(w.OR[0].paymentDate.lt.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(w.description, "2026-11-01", "texto que parece data continua texto");
});

test("banco: select/include não chegam nas tabelas do MCP", () => {
  assert.doesNotThrow(() => conferirRelacoes("Transaction", { category: true, account: { select: { name: true } } }));
  assert.throws(() => conferirRelacoes("CompanyUser", { mcpTokens: true }), /não é exposta/);
  assert.throws(() => conferirRelacoes("Company", { users: { include: { mcpTokens: true } } }), /não é exposta/);
  assert.throws(() => conferirRelacoes("Transaction", { naoExiste: true }), /não tem o campo/);
});

test("sql_leitura: só um SELECT/WITH por vez, sem funções perigosas nem tabelas do MCP", () => {
  assert.equal(sqlPermitido('SELECT count(*) FROM transactions WHERE "companyId" = \'x\''), null);
  assert.equal(sqlPermitido("with a as (select 1) select * from a;"), null);
  assert.equal(sqlPermitido("explain select 1"), null);
  assert.match(sqlPermitido("delete from transactions"), /Só leitura/);
  assert.match(sqlPermitido("select 1; delete from transactions"), /Um comando/);
  assert.match(sqlPermitido("select pg_terminate_backend(1)"), /bloqueado/);
  assert.match(sqlPermitido("select pg_sleep(100)"), /bloqueado/);
  assert.match(sqlPermitido("select * from mcp_tokens"), /tabelas do MCP/);
  assert.match(sqlPermitido("select * from system_config"), /tabelas do MCP/);
  assert.match(sqlPermitido("  "), /vazio/);
});
