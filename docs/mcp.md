# MCP e API v1 do Core Finance

Duas portas no próprio domínio, servidas pelo mesmo registro de ações (`lib/mcp/acoes.ts`):

| Porta | URL | Para quê |
|---|---|---|
| MCP | `https://finance.corestudio.ai/mcp` | IA (Claude Code, Core Agents, Claude.ai). Streamable HTTP sem estado (JSON-RPC por POST, sem SSE) |
| API REST | `https://finance.corestudio.ai/api/v1` | n8n, scripts, integrações |

Cada ação chama a mesma rota de `app/api` que a tela chama, como a pessoa do token: mesma empresa, mesmo papel, mesmas regras (recorrência, folha, conciliação de fatura, "só ADMIN convida"). Nenhuma regra de negócio foi duplicada. Como funciona: `lib/mcp/contexto.ts` guarda a pessoa do token num `AsyncLocalStorage`; `getCompanyId()`, `getCompanyContext()` e `requireAuth()` (`lib/auth.ts`) devolvem essa pessoa quando o pedido vem do MCP, e a sessão do Supabase (cookie) no resto do app.

Padrão seguido: `core-agents/docs/mcps/padrao.md` (o mesmo do Core Uploader).

## Autenticação

- Token por pessoa da equipe: `cf_mcp_` + 48 hex. No banco fica só o sha256 (`mcp_tokens.key_hash`).
- O token pertence a um `company_users` (empresa + papel). Se a pessoa sai da empresa (`isActive=false`), o token para de valer.
- Header `Authorization: Bearer cf_mcp_…` (ou `x-mcp-token`). Sem token, token errado ou revogado: **401** com `WWW-Authenticate: Bearer`.
- `GET /mcp` sem `Accept: text/event-stream` responde a saúde (`nome`, `versao`), sem dados e sem token.

### Escrita em duas chaves (e o papel)

Uma ação de escrita só roda se **todas** valem:

1. `mcp_tokens.can_write = true`;
2. chave geral `system_config` `mcp_remoto = {"escrita": true}`;
3. o papel da pessoa escreve: `VIEWER` é só leitura.

`EVENTS_ONLY` (na tela só vê `/eventos`) só enxerga as ações de eventos e as leituras de apoio (categorias, contatos, departamentos). O `tools/list` e o `GET /api/v1` mostram só o que a pessoa pode usar.

### Auditoria

Uma linha em `mcp_calls` por ação chamada: token, ação, `canal` (`mcp` ou `api`), argumentos (textos longos cortados em 500 caracteres, ex.: arquivo de fatura), ok, erro, tempo. O app não tem tabela de histórico/timeline, então o `mcp_calls` é o registro do que foi feito "via MCP" e por quem.

## Instalar (uma vez)

1. Rodar `prisma/sql/mcp_remoto_2026-10-24.sql` no SQL Editor do Supabase (idempotente). Cria `mcp_tokens`, `mcp_calls`, `system_config` (com `mcp_remoto.escrita = true`), RLS fechada para `anon`/`authenticated` e a função `mcp_create_token`. Os modelos `McpToken`, `McpCall` e `SystemConfig` no `schema.prisma` espelham essas tabelas (um `db push` não as apaga; conferido com `prisma migrate diff`: migração vazia).
2. Deploy normal. Sem a migração, `/mcp` e `/api/v1` respondem 503 (o resto do app não muda).

## Criar, revogar, desligar

```sql
-- devolve o token UMA vez: copie direto para o cofre de quem vai usar
select mcp_create_token('core-agents', 'jcgamer2014@gmail.com', 'Core Agents (IA), age como João', true);
-- só leitura:
select mcp_create_token('n8n-relatorios', 'financeiro@coreeducacao.com', 'n8n', false);
-- e-mail com mais de um vínculo ativo: use o id do company_users no lugar do e-mail

update mcp_tokens set active = false where name = 'core-agents';                    -- revoga
update system_config set value = '{"escrita": false}' where key = 'mcp_remoto';     -- todos só leitura
select t.name, c.tool, c.canal, c.ok, c.error, c.created_at
  from mcp_calls c join mcp_tokens t on t.id = c.token_id order by c.id desc limit 50; -- auditoria
```

## Ferramentas (53: 21 de leitura, 32 de escrita)

Os argumentos usam os nomes de campo do próprio app (`description`, `amount`, `dueDate`, `categoryId`…). Datas `AAAA-MM-DD`, meses `AAAA-MM`. `amount` é sempre positivo; `type` (`INCOME`/`EXPENSE`) diz o sentido.

**Leitura:** `quem_sou_eu`, `ver_painel`, `ver_fluxo_de_caixa`, `ver_relatorio`, `listar_lancamentos`, `ver_lancamento`, `listar_contas`, `listar_cartoes`, `listar_categorias`, `listar_departamentos`, `listar_contatos`, `ver_contato`, `listar_colaboradores`, `ver_remuneracao_variavel`, `listar_eventos`, `ver_evento`, `listar_faturas`, `ver_fatura`, `ver_extracao_fatura`, `ver_equipe`, `ver_configuracoes`.

**Escrita:** `criar_lancamento`, `editar_lancamento`, `baixar_lancamento`, `criar_conta`, `editar_conta`, `criar_cartao`, `editar_cartao`, `criar_categoria`, `editar_categoria`, `criar_departamento`, `editar_departamento`, `criar_contato`, `editar_contato`, `criar_colaborador`, `editar_colaborador`, `mudar_status_colaborador`, `lancar_remuneracao_variavel`, `criar_evento`, `editar_evento`, `criar_item_evento`, `editar_item_evento`, `aprovar_item_evento`, `recusar_item_evento`, `editar_fatura`, `enviar_fatura`, `confirmar_fatura`, `adicionar_membro`, `convidar_membro`, `reenviar_convite`, `revogar_convite`, `mudar_papel_membro`, `editar_configuracoes`.

Ids de outras tabelas (categoria, conta, contato…) são conferidos: têm que ser da mesma empresa do token.

## Paridade com a interface

| Tela | Ação da interface | Ferramenta |
|---|---|---|
| Painel | Ver indicadores do mês/trimestre/ano | `ver_painel` |
| Painel | "Análise da IA" (texto gerado pelo Claude) | fora: a IA que chama o MCP já faz a análise com `ver_painel`; evita custo duplicado |
| Painel | Ajustar nº de pessoas (headcount) | `editar_configuracoes` |
| Lançamentos | Listar, filtrar (tipo, status, categoria, departamento, colaborador, conta, período, busca), ordenar, ver cards | `listar_lancamentos` |
| Lançamentos | Ver um lançamento | `ver_lancamento` |
| Lançamentos | Novo lançamento, linha rápida, duplicar, recorrente (mensal/semanal/quinzenal, com ou sem fim) | `criar_lancamento` |
| Lançamentos | Editar (inclusive propagar categoria/departamento para as próximas parcelas) | `editar_lancamento` |
| Lançamentos | Marcar como pago/recebido | `baixar_lancamento` (desfaz com `editar_lancamento`) |
| Lançamentos | Excluir um ou vários | fora: apagar |
| Lançamentos | Exportar Excel | fora: arquivo gerado no navegador; os dados saem por `listar_lancamentos` |
| Fluxo de caixa | Ver saldos, extrato, projeção; editar lançamento pela tela | `ver_fluxo_de_caixa`, `editar_lancamento` |
| Contas | Listar, criar, editar | `listar_contas`, `criar_conta`, `editar_conta` |
| Contas | Excluir (desativa sem volta pela tela) | fora: apagar |
| Cartões | Listar, criar, editar | `listar_cartoes`, `criar_cartao`, `editar_cartao` |
| Cartões | Excluir | fora: apagar |
| Faturas | Listar, filtrar por cartão/status, ver detalhe | `listar_faturas`, `ver_fatura` |
| Faturas | Mudar status/vencimento | `editar_fatura` |
| Faturas | Importar: enviar arquivo, acompanhar extração, revisar e confirmar | `enviar_fatura`, `ver_extracao_fatura`, `confirmar_fatura` |
| Faturas | Reimportar fatura já existente | fora: substitui (apaga) os lançamentos não pagos da importação anterior; fazer pela tela |
| Faturas | Excluir fatura | fora: apagar |
| Colaboradores | Listar, filtrar | `listar_colaboradores` |
| Colaboradores | Cadastrar (gera 12 meses de salário), editar | `criar_colaborador`, `editar_colaborador` |
| Colaboradores | Pausar, desligar, reativar | `mudar_status_colaborador` |
| Colaboradores | Remuneração variável do mês (ver, lançar) | `ver_remuneracao_variavel`, `lancar_remuneracao_variavel` |
| Colaboradores | Zerar variável (apaga o registro e o lançamento) / excluir colaborador | fora: apagar |
| Contatos | Listar, buscar, ver, criar, editar | `listar_contatos`, `ver_contato`, `criar_contato`, `editar_contato` |
| Contatos | Arquivar / reativar | `editar_contato` com `isActive` |
| Contatos | Excluir | fora: apagar |
| Eventos | Listar, ver, criar, editar (inclusive status) | `listar_eventos`, `ver_evento`, `criar_evento`, `editar_evento` |
| Eventos | Itens: adicionar, editar, aprovar (vira lançamento), recusar | `criar_item_evento`, `editar_item_evento`, `aprovar_item_evento`, `recusar_item_evento` |
| Eventos | Excluir evento ou item | fora: apagar |
| Categorias | Listar (com inativas), criar categoria/subcategoria, renomear, mudar cor | `listar_categorias`, `criar_categoria`, `editar_categoria` |
| Categorias | Desativar / reativar | `editar_categoria` com `isActive` |
| Categorias | Departamentos: listar, criar, editar, orçamento mensal | `listar_departamentos`, `criar_departamento`, `editar_departamento` |
| Categorias | Excluir departamento | fora: apagar |
| Relatórios | DRE, receitas, despesas detalhadas por período | `ver_relatorio` |
| Equipe | Ver membros e convites | `ver_equipe` |
| Equipe | Adicionar membro, convidar, reenviar e revogar convite, mudar papel (só ADMIN, como na tela) | `adicionar_membro`, `convidar_membro`, `reenviar_convite`, `revogar_convite`, `mudar_papel_membro` |
| Equipe | Remover membro | fora: tira o acesso de uma pessoa; fazer pela tela |
| Configurações | Ver e editar dados da empresa | `ver_configuracoes`, `editar_configuracoes` |
| Configurações | Criar outra empresa / excluir empresa | fora: o token pertence a uma empresa; excluir é apagar |
| (sistema) | Webhooks (vendas, WhatsApp), crons de relatório, setup inicial | fora: não são ações de pessoa na tela |

## API v1

- `GET /api/v1` → lista de ações (`nome`, `descricao`, `escrita`, `metodo`, `schema` JSON).
- `GET /api/v1/<acao>?param=…` → leitura. Lista: `status=PENDING&status=OVERDUE`, `status=PENDING,OVERDUE` ou JSON.
- `POST /api/v1/<acao>` com corpo JSON → qualquer ação (obrigatório para escrita).
- Resposta `{ "ok": true, "dados": … }` ou `{ "ok": false, "erro": "…", "detalhes"?: … }` com 400 (argumentos), 401 (token), 403 (sem escrita / papel), 404 (ação), 405 (escrita por GET), 422 (o app recusou: não encontrado, conciliação, só ADMIN…), 500, 503 (migração pendente).

```bash
curl -s https://finance.corestudio.ai/api/v1/listar_lancamentos?month=2026-10\&status=PENDING -H "Authorization: Bearer $TOKEN"
curl -s -X POST https://finance.corestudio.ai/api/v1/baixar_lancamento -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"id":"…","paymentDate":"2026-10-24"}'
```

## Usar no Claude Code

```bash
claude mcp add --transport http core-finance https://finance.corestudio.ai/mcp --header "Authorization: Bearer $TOKEN"
```

## Testes

- `npm run test:mcp`: núcleo (token, JSON-RPC, permissão por papel e escrita, auditoria, corte de saída, REST e códigos, registro sem ação de apagar).
- Aceite ponta a ponta: Postgres local (Docker) com o schema (`prisma db push`) + o SQL acima, `next dev` apontando para ele e as chamadas reais pelas duas portas. Ver a descrição do PR.

## Arquivos

- `app/mcp/route.ts`, `app/api/v1/[[...acao]]/route.ts`: as portas.
- `lib/mcp/nucleo.ts`: JSON-RPC, REST, permissão, auditoria (sem banco; testável com `node --test`).
- `lib/mcp/acoes.ts`: o registro.
- `lib/mcp/rotas.ts`: chama as rotas de `app/api` por dentro.
- `lib/mcp/sessao.ts`: token → pessoa, gravação em `mcp_calls`.
- `lib/mcp/contexto.ts` + `lib/auth.ts`: a pessoa do token para as rotas existentes.
- `proxy.ts`: `/mcp` e `/api/v1` fora do refresh de sessão por cookie.
