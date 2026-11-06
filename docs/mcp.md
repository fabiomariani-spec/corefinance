# MCP e API v1 do Core Finance

Duas portas no próprio domínio, servidas pelo mesmo registro de ações (`lib/mcp/acoes.ts`):

| Porta | URL | Para quê |
|---|---|---|
| MCP | `https://finance.corestudio.ai/mcp` | IA (Claude Code, Core Agents, Claude.ai). Streamable HTTP sem estado (JSON-RPC por POST, sem SSE) |
| API REST | `https://finance.corestudio.ai/api/v1` | n8n, scripts, integrações |

Cada ação chama a mesma rota de `app/api` que a tela chama, como a pessoa do token: mesma empresa, mesmo papel, mesmas regras (recorrência, folha, conciliação de fatura, "só ADMIN convida"). Nenhuma regra de negócio foi duplicada.

**Cobertura: 100% da tela, mais o que ela não faz.** Toda rota de `app/api` usada pela interface virou ação. As poucas que não viraram são de sistema (webhooks, cron, aceite de convite) e estão justificadas no teste `cobertura` (`tests/mcp.test.mjs`). Uma rota nova sem ação quebra o teste. Por cima disso vêm os extras: lotes, CSV, os relatórios do WhatsApp, o assistente, a auditoria, o acesso genérico ao banco (sempre recortado pela empresa) e o SQL só de leitura. Como funciona: `lib/mcp/contexto.ts` guarda a pessoa do token num `AsyncLocalStorage`; `getCompanyId()`, `getCompanyContext()` e `requireAuth()` (`lib/auth.ts`) devolvem essa pessoa quando o pedido vem do MCP, e a sessão do Supabase (cookie) no resto do app.

Padrão seguido: `core-agents/docs/mcps/padrao.md` (o mesmo do Core Uploader).

## Autenticação

- Token por pessoa da equipe: `cf_mcp_` + 48 hex. No banco fica só o sha256 (`mcp_tokens.key_hash`).
- O token pertence a um `company_users` (empresa + papel). Se a pessoa sai da empresa (`isActive=false`), o token para de valer.
- Header `Authorization: Bearer cf_mcp_…` (ou `x-mcp-token`). Sem token, token errado ou revogado: **401** com `WWW-Authenticate: Bearer`.
- `GET /mcp` sem `Accept: text/event-stream` responde a saúde (`nome`, `versao`), sem dados e sem token.

### Apagar

Toda ação que apaga ou desativa (`excluir_*`, `desativar_*`, `zerar_*`, `remover_membro`, `banco_apagar`) tem a anotação `destructiveHint: true` e só roda com `confirmar: true` no argumento. A IA tem que confirmar com a pessoa antes. `banco_atualizar` e `banco_apagar` sem `confirmar` só mostram a **prévia** (quantos registros e uma amostra).

### Só ADMIN e SQL

- `soAdmin`: `banco_*`, `sql_leitura`, `ver_auditoria_mcp` e `excluir_empresa` só aparecem e só rodam para quem é ADMIN.
- `sql_leitura` também exige `mcp_tokens.can_sql = true`, porque o SQL cru **não** recorta por empresa (enxerga todas). Roda em transação `READ ONLY` com timeout de 20s, um comando por vez, sem funções perigosas (`pg_terminate_backend`, `pg_sleep`, `dblink`, `copy`…) e sem as tabelas do MCP.

### Escrita em duas chaves (e o papel)

Uma ação de escrita só roda se **todas** valem:

1. `mcp_tokens.can_write = true`;
2. chave geral `system_config` `mcp_remoto = {"escrita": true}`;
3. o papel da pessoa escreve: `VIEWER` é só leitura.

`EVENTS_ONLY` (na tela só vê `/eventos`) só enxerga as ações de eventos e as leituras de apoio (categorias, contatos, departamentos). O `tools/list` e o `GET /api/v1` mostram só o que a pessoa pode usar.

### Auditoria

Uma linha em `mcp_calls` por ação chamada: token, ação, `canal` (`mcp` ou `api`), argumentos (textos longos cortados em 500 caracteres, ex.: arquivo de fatura), ok, erro, tempo. O app não tem tabela de histórico/timeline, então o `mcp_calls` é o registro do que foi feito "via MCP" e por quem.

## Instalar (uma vez)

1. Rodar `prisma/sql/mcp_remoto_2026-10-24.sql` no SQL Editor do Supabase (idempotente). Cria `mcp_tokens` (com `can_sql`), `mcp_calls`, `system_config` (com `mcp_remoto.escrita = true`), RLS fechada para `anon`/`authenticated`, sem acesso para `gabriel_dev` (com escrita em `mcp_tokens` daria pra criar token agindo como outra pessoa) e a função `mcp_create_token`. **Aplicado em produção em 06/11/2026.** Os modelos `McpToken`, `McpCall` e `SystemConfig` no `schema.prisma` espelham essas tabelas (um `db push` não as apaga; conferido com `prisma migrate diff`: migração vazia).
2. Deploy normal. Sem a migração, `/mcp` e `/api/v1` respondem 503 (o resto do app não muda).

## Criar, revogar, desligar

```sql
-- devolve o token UMA vez: copie direto para o cofre de quem vai usar
select mcp_create_token('core-agents', 'jcgamer2014@gmail.com', 'Core Agents (IA), age como João', true);
-- só leitura:
select mcp_create_token('n8n-relatorios', 'financeiro@coreeducacao.com', 'n8n', false);
-- com SQL cru (6º argumento); o 5º é a empresa, se a pessoa está em mais de uma:
select mcp_create_token('joao-completo', 'jcgamer2014@gmail.com', 'João', true, 'cmms493rz000013v99n3ti3rx', true);
-- e-mail com mais de um vínculo ativo: use o id do company_users no lugar do e-mail

update mcp_tokens set active = false where name = 'core-agents';                    -- revoga
update system_config set value = '{"escrita": false}' where key = 'mcp_remoto';     -- todos só leitura
select t.name, c.tool, c.canal, c.ok, c.error, c.created_at
  from mcp_calls c join mcp_tokens t on t.id = c.token_id order by c.id desc limit 50; -- auditoria
```

## Ferramentas (85: 33 de leitura, 37 de escrita, 15 que apagam)

Os argumentos usam os nomes de campo do próprio app (`description`, `amount`, `dueDate`, `categoryId`…). Datas `AAAA-MM-DD`, meses `AAAA-MM`. `amount` é sempre positivo; `type` (`INCOME`/`EXPENSE`) diz o sentido.

**Leitura (tela):** `quem_sou_eu`, `ver_painel`, `analise_ia_painel`, `ver_fluxo_de_caixa`, `ver_relatorio`, `listar_lancamentos`, `ver_lancamento`, `listar_contas`, `listar_cartoes`, `listar_categorias`, `listar_departamentos`, `listar_contatos`, `ver_contato`, `listar_colaboradores`, `ver_remuneracao_variavel`, `listar_eventos`, `ver_evento`, `listar_faturas`, `ver_fatura`, `ver_extracao_fatura`, `ver_equipe`, `ver_configuracoes`.

**Escrita (tela):** `criar_lancamento`, `editar_lancamento`, `baixar_lancamento`, `criar_conta`, `editar_conta`, `criar_cartao`, `editar_cartao`, `criar_categoria`, `editar_categoria`, `criar_departamento`, `editar_departamento`, `criar_contato`, `editar_contato`, `criar_colaborador`, `editar_colaborador`, `mudar_status_colaborador`, `lancar_remuneracao_variavel`, `criar_evento`, `editar_evento`, `criar_item_evento`, `editar_item_evento`, `aprovar_item_evento`, `recusar_item_evento`, `editar_fatura`, `enviar_fatura`, `confirmar_fatura` (com `substituir=true` reimporta), `adicionar_membro`, `convidar_membro`, `reenviar_convite`, `revogar_convite`, `mudar_papel_membro`, `editar_configuracoes`, `criar_empresa`.

**Apagar (tela, com `confirmar: true`):** `excluir_lancamento`, `excluir_lancamentos`, `desativar_conta`, `desativar_cartao`, `desativar_categoria`, `desativar_departamento`, `excluir_contato` (`arquivar=true` só arquiva), `excluir_colaborador`, `zerar_remuneracao_variavel`, `excluir_evento`, `excluir_item_evento`, `excluir_fatura` (`forcar=true` com lançamento pago), `remover_membro`, `excluir_empresa`.

**Além da tela:** `listar_minhas_empresas`, `baixar_lancamentos` (lote), `editar_lancamentos` (lote), `exportar_lancamentos_csv`, `relatorio_diario` e `relatorio_semanal` (os textos do bot do WhatsApp), `perguntar_assistente` (o assistente do WhatsApp), `ver_auditoria_mcp`.

**Acesso direto ao banco (só ADMIN, sempre recortado pela empresa do token, SEM as regras de negócio da tela):** `banco_modelos` (mapa de modelos/campos/enums), `banco_consultar` (findMany com where/select/include/orderBy), `banco_contar`, `banco_agregar` (soma/média/mín/máx, com ou sem agrupamento), `banco_criar` (até 500), `banco_atualizar` e `banco_apagar` (prévia sem `confirmar`). Escrita genérica só nos modelos financeiros: equipe, convites e empresa ficam nas ferramentas da tela. `sql_leitura` (ADMIN + `can_sql`).

Ids de outras tabelas (categoria, conta, contato…) são conferidos: têm que ser da mesma empresa do token.

## Paridade com a interface

| Tela | Ação da interface | Ferramenta |
|---|---|---|
| Painel | Ver indicadores do mês/trimestre/ano | `ver_painel` |
| Painel | "Análise da IA" (texto gerado pelo Claude) | `analise_ia_painel` |
| Painel | Ajustar nº de pessoas (headcount) | `editar_configuracoes` |
| Lançamentos | Listar, filtrar (tipo, status, categoria, departamento, colaborador, conta, período, busca), ordenar, ver cards | `listar_lancamentos` |
| Lançamentos | Ver um lançamento | `ver_lancamento` |
| Lançamentos | Novo lançamento, linha rápida, duplicar, recorrente (mensal/semanal/quinzenal, com ou sem fim) | `criar_lancamento` |
| Lançamentos | Editar (inclusive propagar categoria/departamento para as próximas parcelas) | `editar_lancamento`, em lote `editar_lancamentos` |
| Lançamentos | Marcar como pago/recebido | `baixar_lancamento`, em lote `baixar_lancamentos` |
| Lançamentos | Excluir um ou vários | `excluir_lancamento`, `excluir_lancamentos` |
| Lançamentos | Exportar Excel | `exportar_lancamentos_csv` |
| Fluxo de caixa | Ver saldos, extrato, projeção; editar lançamento pela tela | `ver_fluxo_de_caixa`, `editar_lancamento` |
| Contas | Listar, criar, editar, excluir (desativa) | `listar_contas`, `criar_conta`, `editar_conta`, `desativar_conta` |
| Cartões | Listar, criar, editar, excluir (desativa) | `listar_cartoes`, `criar_cartao`, `editar_cartao`, `desativar_cartao` |
| Faturas | Listar, filtrar por cartão/status, ver detalhe | `listar_faturas`, `ver_fatura` |
| Faturas | Mudar status/vencimento | `editar_fatura` |
| Faturas | Importar: enviar arquivo, acompanhar extração, revisar e confirmar | `enviar_fatura`, `ver_extracao_fatura`, `confirmar_fatura` |
| Faturas | Reimportar fatura já existente | `confirmar_fatura` com `substituir=true` |
| Faturas | Excluir fatura | `excluir_fatura` |
| Colaboradores | Listar, filtrar | `listar_colaboradores` |
| Colaboradores | Cadastrar (gera 12 meses de salário), editar | `criar_colaborador`, `editar_colaborador` |
| Colaboradores | Pausar, desligar, reativar | `mudar_status_colaborador` |
| Colaboradores | Remuneração variável do mês (ver, lançar, zerar) | `ver_remuneracao_variavel`, `lancar_remuneracao_variavel`, `zerar_remuneracao_variavel` |
| Colaboradores | Excluir colaborador | `excluir_colaborador` |
| Contatos | Listar, buscar, ver, criar, editar | `listar_contatos`, `ver_contato`, `criar_contato`, `editar_contato` |
| Contatos | Arquivar / reativar / excluir | `excluir_contato` (`arquivar=true`), `editar_contato` com `isActive` |
| Eventos | Listar, ver, criar, editar (inclusive status) | `listar_eventos`, `ver_evento`, `criar_evento`, `editar_evento` |
| Eventos | Itens: adicionar, editar, aprovar (vira lançamento), recusar | `criar_item_evento`, `editar_item_evento`, `aprovar_item_evento`, `recusar_item_evento` |
| Eventos | Excluir evento ou item | `excluir_evento`, `excluir_item_evento` |
| Categorias | Listar (com inativas), criar categoria/subcategoria, renomear, mudar cor | `listar_categorias`, `criar_categoria`, `editar_categoria` |
| Categorias | Excluir (desativa, com as filhas) / reativar | `desativar_categoria`, `editar_categoria` com `isActive` |
| Categorias | Departamentos: listar, criar, editar, orçamento mensal, excluir | `listar_departamentos`, `criar_departamento`, `editar_departamento`, `desativar_departamento` |
| Relatórios | DRE, receitas, despesas detalhadas por período | `ver_relatorio` |
| Equipe | Ver membros e convites | `ver_equipe` |
| Equipe | Adicionar membro, convidar, reenviar e revogar convite, mudar papel (só ADMIN, como na tela) | `adicionar_membro`, `convidar_membro`, `reenviar_convite`, `revogar_convite`, `mudar_papel_membro` |
| Equipe | Remover membro | `remover_membro` |
| Configurações | Ver e editar dados da empresa | `ver_configuracoes`, `editar_configuracoes` |
| Configurações | Criar outra empresa / excluir empresa | `criar_empresa`, `excluir_empresa` (nome exato + `confirmar`) |
| (sistema) | Webhooks (vendas, WhatsApp), crons de relatório, setup inicial, aceite de convite | fora (não são ações de quem usa a tela); o conteúdo sai por `relatorio_diario`, `relatorio_semanal`, `perguntar_assistente`, `criar_empresa` |

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

- `npm run test:mcp`: núcleo (token, JSON-RPC, permissão por papel, escrita, ADMIN e SQL, auditoria, corte de saída, REST e códigos), registro (toda ação que apaga é marcada e pede `confirmar`), **cobertura** (toda rota de `app/api` tem ação ou motivo) e as regras do acesso ao banco (recorte por empresa, limpeza de dados, datas, relações bloqueadas, filtro do SQL).
- Aceite ponta a ponta: Postgres local (Docker) com o schema (`prisma db push`) + o SQL acima, `next dev` apontando para ele e as chamadas reais pelas duas portas. Ver a descrição do PR.

## Arquivos

- `app/mcp/route.ts`, `app/api/v1/[[...acao]]/route.ts`: as portas.
- `lib/mcp/nucleo.ts`: JSON-RPC, REST, permissão, auditoria (sem banco; testável com `node --test`).
- `lib/mcp/acoes.ts`: o registro.
- `lib/mcp/banco.ts` + `lib/mcp/banco-regras.ts`: acesso genérico ao banco e SQL só leitura (as regras puras ficam no `banco-regras`, testável sem banco).
- `lib/mcp/rotas.ts`: chama as rotas de `app/api` por dentro.
- `lib/mcp/sessao.ts`: token → pessoa, gravação em `mcp_calls`.
- `lib/mcp/contexto.ts` + `lib/auth.ts`: a pessoa do token para as rotas existentes.
- `proxy.ts`: `/mcp` e `/api/v1` fora do refresh de sessão por cookie.
