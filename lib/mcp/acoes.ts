/**
 * Registro de ações do MCP (/mcp) e da API (/api/v1) do Core Finance.
 *
 * Cada ação chama a MESMA rota de app/api que a tela chama (lib/mcp/rotas.ts),
 * como a pessoa do token: mesma empresa, mesmo papel, mesmas regras (folha,
 * recorrência, conciliação de fatura, "só ADMIN convida"…). Os argumentos usam
 * os nomes de campo do próprio app (description, amount, dueDate…).
 *
 * Fora de propósito: apagar (lançamento, conta, cartão, contato, colaborador,
 * evento, fatura, membro, empresa). Desativar/arquivar o que a tela deixa
 * reativar entra (categoria, contato). Tabela completa em docs/mcp.md.
 */
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { identidadeMcp } from "@/lib/mcp/contexto";
import { acao, Recusa, type Acao } from "@/lib/mcp/nucleo";
import { chamar } from "@/lib/mcp/rotas";

import * as rDashboard from "@/app/api/dashboard/route";
import * as rCashFlow from "@/app/api/cash-flow/route";
import * as rReports from "@/app/api/reports/route";
import * as rTx from "@/app/api/transactions/route";
import * as rTxId from "@/app/api/transactions/[id]/route";
import * as rAccounts from "@/app/api/accounts/route";
import * as rAccountId from "@/app/api/accounts/[id]/route";
import * as rCards from "@/app/api/credit-cards/route";
import * as rCardId from "@/app/api/credit-cards/[id]/route";
import * as rCategories from "@/app/api/categories/route";
import * as rCategoryId from "@/app/api/categories/[id]/route";
import * as rDepartments from "@/app/api/departments/route";
import * as rDepartmentId from "@/app/api/departments/[id]/route";
import * as rContacts from "@/app/api/contacts/route";
import * as rContactId from "@/app/api/contacts/[id]/route";
import * as rEmployees from "@/app/api/employees/route";
import * as rEmployeeId from "@/app/api/employees/[id]/route";
import * as rEmployeeStatus from "@/app/api/employees/[id]/status/route";
import * as rVariable from "@/app/api/employees/variable/route";
import * as rEvents from "@/app/api/events/route";
import * as rEventId from "@/app/api/events/[id]/route";
import * as rEventItems from "@/app/api/events/[id]/items/route";
import * as rEventItemId from "@/app/api/events/[id]/items/[itemId]/route";
import * as rEventApprove from "@/app/api/events/[id]/items/[itemId]/approve/route";
import * as rEventReject from "@/app/api/events/[id]/items/[itemId]/reject/route";
import * as rInvoices from "@/app/api/invoices/route";
import * as rInvoiceId from "@/app/api/invoices/[id]/route";
import * as rInvoiceUpload from "@/app/api/invoices/upload/route";
import * as rInvoiceJob from "@/app/api/invoices/job/[id]/route";
import * as rInvoiceConfirm from "@/app/api/invoices/confirm/route";
import * as rTeam from "@/app/api/team/route";
import * as rTeamMember from "@/app/api/team/[memberId]/route";
import * as rInvite from "@/app/api/team/invite/route";
import * as rInviteResend from "@/app/api/team/invite/resend/route";
import * as rSettings from "@/app/api/settings/route";

// ─── Tipos comuns ───────────────────────────────────────────────────────────

const ID = z.string().min(1);
const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");
const MES = z.string().regex(/^\d{4}-\d{2}$/, "use AAAA-MM");
const TIPO = z.enum(["INCOME", "EXPENSE"]);
const STATUS_TX = z.enum(["PENDING", "PREDICTED", "PAID", "RECEIVED", "OVERDUE", "CANCELLED"]);
const METODO = z.enum(["CREDIT_CARD", "DEBIT_CARD", "BANK_TRANSFER", "PIX", "BOLETO", "CASH", "CHECK", "MERCADO_PAGO", "OTHER"]);
const PAPEL = z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER", "EVENTS_ONLY"]);
const COR = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "cor em hex, ex.: #6366f1");
const opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

function eu() {
  const id = identidadeMcp();
  if (!id) throw new Error("Ação do MCP fora do contexto do token.");
  return id;
}

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Tira as chaves undefined (a rota distingue "não mandou" de null). */
function limpo<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Ids de outras tabelas precisam ser da mesma empresa (a rota confia na tela). */
async function daEmpresa(refs: {
  categoryId?: string | null;
  departmentId?: string | null;
  employeeId?: string | null;
  contactId?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
}) {
  const companyId = eu().companyId;
  const checar: [string, string | null | undefined, (id: string) => Promise<unknown>][] = [
    ["categoryId", refs.categoryId, (id) => prisma.category.findFirst({ where: { id, companyId }, select: { id: true } })],
    ["departmentId", refs.departmentId, (id) => prisma.department.findFirst({ where: { id, companyId }, select: { id: true } })],
    ["employeeId", refs.employeeId, (id) => prisma.employee.findFirst({ where: { id, companyId }, select: { id: true } })],
    ["contactId", refs.contactId, (id) => prisma.contact.findFirst({ where: { id, companyId }, select: { id: true } })],
    ["accountId", refs.accountId, (id) => prisma.account.findFirst({ where: { id, companyId }, select: { id: true } })],
    ["creditCardId", refs.creditCardId, (id) => prisma.creditCard.findFirst({ where: { id, companyId }, select: { id: true } })],
  ];
  for (const [campo, valor, buscar] of checar) {
    if (valor && !(await buscar(valor))) throw new Recusa(`${campo} ${valor} não existe nesta empresa.`);
  }
}

async function existe(oQue: string, achado: unknown) {
  if (!achado) throw new Recusa(`${oQue} não encontrado nesta empresa.`, 422);
}

// ─── Campos de lançamento (iguais aos do POST /api/transactions) ─────────────

const camposLancamento = {
  description: z.string().min(1).describe("Descrição"),
  amount: z.number().positive().describe("Valor positivo em reais (o tipo diz se é entrada ou saída)"),
  type: TIPO.describe("INCOME = entrada, EXPENSE = saída"),
  status: STATUS_TX.optional().describe("Padrão PENDING. PAID/RECEIVED = já pago/recebido (informe paymentDate)"),
  isPredicted: z.boolean().optional(),
  categoryId: opc(ID),
  departmentId: opc(ID),
  employeeId: opc(ID).describe("Colaborador (despesa de pessoal)"),
  contactId: opc(ID).describe("Fornecedor/cliente"),
  accountId: opc(ID).describe("Conta bancária"),
  creditCardId: opc(ID),
  competenceDate: DATA.describe("Competência (AAAA-MM-DD)"),
  dueDate: opc(DATA).describe("Vencimento"),
  paymentDate: opc(DATA).describe("Data do pagamento/recebimento"),
  paymentMethod: opc(METODO),
  notes: opc(z.string()),
  tags: z.array(z.string()).optional(),
};

// ─── Registro ───────────────────────────────────────────────────────────────

export const ACOES: Acao[] = [
  // ── Quem sou eu ──
  acao({
    nome: "quem_sou_eu",
    descricao: "Em nome de quem este token age: pessoa, papel, empresa e se pode alterar dados.",
    schema: z.object({}),
    escrita: false,
    area: "apoio",
    executar: async () => {
      const id = eu();
      const empresa = await prisma.company.findUnique({ where: { id: id.companyId }, select: { id: true, name: true } });
      return {
        nome: id.nome,
        email: id.email,
        papel: id.role,
        empresa,
        podeEscrever: id.podeEscrever && id.role !== "VIEWER",
        token: id.tokenNome,
        canal: id.canal,
      };
    },
  }),

  // ── Painel, fluxo de caixa e relatórios ──
  acao({
    nome: "ver_painel",
    descricao:
      "Painel (tela inicial): receitas, despesas, lucro, margem, burn rate, runway, saldo em caixa e tendências do período, com comparação ao período anterior.",
    schema: z.object({
      date: opc(DATA).describe("Data de referência (padrão hoje)"),
      period: z.enum(["month", "quarter", "year"]).optional().describe("Padrão month"),
    }),
    escrita: false,
    executar: (a) => chamar(rDashboard.GET, { caminho: "/api/dashboard", query: a }),
  }),
  acao({
    nome: "ver_fluxo_de_caixa",
    descricao: "Fluxo de caixa: saldos por conta, extrato e projeção do período (mês ou intervalo).",
    schema: z.object({
      month: opc(MES).describe("Mês AAAA-MM (padrão o atual)"),
      startDate: opc(DATA).describe("Início do intervalo (use com endDate)"),
      endDate: opc(DATA),
    }),
    escrita: false,
    executar: (a) => chamar(rCashFlow.GET, { caminho: "/api/cash-flow", query: a }),
  }),
  acao({
    nome: "ver_relatorio",
    descricao:
      "Relatórios: dre (DRE gerencial), revenue (receitas por produto/categoria) ou detailed-expenses (despesas por categoria e departamento). Ignora cancelados e previstos.",
    schema: z.object({
      type: z.enum(["dre", "revenue", "detailed-expenses"]).optional().describe("Padrão dre"),
      startDate: opc(DATA).describe("Padrão início do mês atual"),
      endDate: opc(DATA).describe("Padrão fim do mês atual"),
    }),
    escrita: false,
    executar: (a) => chamar(rReports.GET, { caminho: "/api/reports", query: a }),
  }),

  // ── Lançamentos ──
  acao({
    nome: "listar_lancamentos",
    descricao:
      "Lançamentos (contas a pagar/receber) com os filtros da tela e os totais dos cards (a pagar, pago, recebido, por departamento, por banco). Período: pagos/recebidos recortam pela data de pagamento; o resto pelo vencimento.",
    schema: z.object({
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(200).optional().describe("Padrão 50"),
      type: opc(TIPO),
      status: z.array(STATUS_TX).optional(),
      categoryId: opc(ID),
      departmentId: opc(ID),
      employeeId: opc(ID),
      accountId: opc(ID),
      month: opc(MES),
      startDate: opc(DATA),
      endDate: opc(DATA),
      search: opc(z.string()).describe("Busca sem acento em descrição, categoria, departamento e contato"),
      sortBy: z
        .enum(["competenceDate", "dueDate", "paymentDate", "description", "category", "department", "status", "amount", "name"])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }),
    escrita: false,
    executar: (a) => chamar(rTx.GET, { caminho: "/api/transactions", query: a }),
  }),
  acao({
    nome: "ver_lancamento",
    descricao: "Um lançamento com categoria, departamento, contato, conta, cartão e anexos.",
    schema: z.object({ id: ID }),
    escrita: false,
    executar: ({ id }) => chamar(rTxId.GET, { caminho: `/api/transactions/${id}`, params: { id } }),
  }),
  acao({
    nome: "criar_lancamento",
    descricao:
      "Cria um lançamento (como o formulário de Lançamentos). Recorrente: isRecurring=true + recurringMonths (nº de meses/ocorrências) ou openEnded=true; recurrenceFrequency MONTHLY (padrão, dia dueDayOfMonth), WEEKLY ou BIWEEKLY. Vencimento em fim de semana vai para a sexta anterior.",
    schema: z.object({
      ...camposLancamento,
      isRecurring: z.boolean().optional(),
      installmentNumber: opc(z.number().int()),
      installmentTotal: opc(z.number().int()),
      recurringMonths: z.number().int().min(0).max(520).optional(),
      dueDayOfMonth: z.number().int().min(1).max(31).optional(),
      openEnded: z.boolean().optional(),
      recurrenceFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
    }),
    escrita: true,
    executar: async (a) => {
      await daEmpresa(a);
      return chamar(rTx.POST, { metodo: "POST", caminho: "/api/transactions", corpo: limpo(a) });
    },
  }),
  acao({
    nome: "editar_lancamento",
    descricao:
      "Edita campos de um lançamento (só os enviados). null limpa o campo. propagateFuture=true leva categoria/departamento às próximas parcelas abertas do mesmo grupo. Para dar baixa use baixar_lancamento.",
    schema: z.object({
      id: ID,
      description: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      type: TIPO.optional(),
      status: STATUS_TX.optional(),
      isPredicted: z.boolean().optional(),
      isRecurring: z.boolean().optional(),
      categoryId: opc(ID),
      departmentId: opc(ID),
      employeeId: opc(ID),
      contactId: opc(ID),
      accountId: opc(ID),
      creditCardId: opc(ID),
      competenceDate: DATA.optional(),
      dueDate: opc(DATA),
      paymentDate: opc(DATA),
      paymentMethod: opc(METODO),
      notes: opc(z.string()),
      tags: z.array(z.string()).optional(),
      propagateFuture: z.boolean().optional(),
    }),
    escrita: true,
    executar: async ({ id, ...resto }) => {
      await daEmpresa(resto);
      const r = await chamar<{ updated: number }>(rTxId.PUT, {
        metodo: "PUT",
        caminho: `/api/transactions/${id}`,
        params: { id },
        corpo: limpo(resto),
      });
      if (!r.updated) throw new Recusa(`Lançamento ${id} não encontrado nesta empresa.`);
      return r;
    },
  }),
  acao({
    nome: "baixar_lancamento",
    descricao:
      "Dá baixa: marca como PAID (saída) ou RECEIVED (entrada) com a data de pagamento (padrão hoje) e, se quiser, a conta. Desfaz com editar_lancamento status=PENDING, paymentDate=null.",
    schema: z.object({ id: ID, paymentDate: DATA.optional(), accountId: ID.optional() }),
    escrita: true,
    executar: async ({ id, paymentDate, accountId }) => {
      await daEmpresa({ accountId });
      const tx = await prisma.transaction.findFirst({ where: { id, companyId: eu().companyId }, select: { type: true } });
      await existe("Lançamento", tx);
      const corpo = limpo({ status: tx!.type === "INCOME" ? "RECEIVED" : "PAID", paymentDate: paymentDate ?? hoje(), accountId });
      await chamar(rTxId.PUT, { metodo: "PUT", caminho: `/api/transactions/${id}`, params: { id }, corpo });
      return { ok: true, id, ...corpo };
    },
  }),

  // ── Contas bancárias ──
  acao({
    nome: "listar_contas",
    descricao: "Contas bancárias ativas com saldo atual (inicial + recebidos − pagos) e saldo inicial.",
    schema: z.object({}),
    escrita: false,
    executar: () => chamar(rAccounts.GET, { caminho: "/api/accounts" }),
  }),
  acao({
    nome: "criar_conta",
    descricao: "Cria conta bancária. balance = saldo inicial.",
    schema: z.object({
      name: z.string().min(1),
      type: z.enum(["CHECKING", "SAVINGS", "INVESTMENT", "CASH"]).optional(),
      bank: opc(z.string()),
      agency: opc(z.string()),
      accountNumber: opc(z.string()),
      balance: z.number().optional(),
      color: COR.optional(),
    }),
    escrita: true,
    executar: (a) => chamar(rAccounts.POST, { metodo: "POST", caminho: "/api/accounts", corpo: limpo(a) }),
  }),
  acao({
    nome: "editar_conta",
    descricao: "Edita campos de uma conta bancária (só os enviados). balance = saldo inicial.",
    schema: z.object({
      id: ID,
      name: z.string().min(1).optional(),
      type: z.enum(["CHECKING", "SAVINGS", "INVESTMENT", "CASH"]).optional(),
      bank: opc(z.string()),
      agency: opc(z.string()),
      accountNumber: opc(z.string()),
      balance: z.number().optional(),
      color: COR.optional(),
    }),
    escrita: true,
    executar: async ({ id, ...resto }) => {
      await existe("Conta", await prisma.account.findFirst({ where: { id, companyId: eu().companyId, isActive: true } }));
      return chamar(rAccountId.PATCH, { metodo: "PATCH", caminho: `/api/accounts/${id}`, params: { id }, corpo: limpo(resto) });
    },
  }),

  // ── Cartões ──
  acao({
    nome: "listar_cartoes",
    descricao: "Cartões de crédito ativos com limite, fechamento, vencimento e o usado no mês.",
    schema: z.object({}),
    escrita: false,
    executar: () => chamar(rCards.GET, { caminho: "/api/credit-cards" }),
  }),
  acao({
    nome: "criar_cartao",
    descricao: "Cria cartão de crédito.",
    schema: z.object({
      name: z.string().min(1),
      bank: opc(z.string()),
      brand: z.enum(["VISA", "MASTERCARD", "AMEX", "ELO", "HIPERCARD", "OTHER"]).optional(),
      lastFour: opc(z.string().regex(/^\d{4}$/)),
      limit: z.number().min(0).optional(),
      closingDay: z.number().int().min(1).max(31).optional(),
      dueDay: z.number().int().min(1).max(31).optional(),
      holder: opc(z.string()),
      color: COR.optional(),
    }),
    escrita: true,
    executar: (a) => chamar(rCards.POST, { metodo: "POST", caminho: "/api/credit-cards", corpo: limpo(a) }),
  }),
  acao({
    nome: "editar_cartao",
    descricao: "Edita campos de um cartão (só os enviados).",
    schema: z.object({
      id: ID,
      name: z.string().min(1).optional(),
      bank: opc(z.string()),
      brand: z.enum(["VISA", "MASTERCARD", "AMEX", "ELO", "HIPERCARD", "OTHER"]).optional(),
      lastFour: opc(z.string().regex(/^\d{4}$/)),
      limit: z.number().min(0).optional(),
      closingDay: z.number().int().min(1).max(31).optional(),
      dueDay: z.number().int().min(1).max(31).optional(),
      holder: opc(z.string()),
      color: COR.optional(),
    }),
    escrita: true,
    executar: async ({ id, ...resto }) => {
      await existe("Cartão", await prisma.creditCard.findFirst({ where: { id, companyId: eu().companyId, isActive: true } }));
      return chamar(rCardId.PATCH, { metodo: "PATCH", caminho: `/api/credit-cards/${id}`, params: { id }, corpo: limpo(resto) });
    },
  }),

  // ── Categorias e departamentos ──
  acao({
    nome: "listar_categorias",
    descricao: "Plano de contas: categorias de receita/despesa com subcategorias (children).",
    schema: z.object({ type: opc(TIPO), includeInactive: z.boolean().optional().describe("Inclui as desativadas") }),
    escrita: false,
    area: "apoio",
    executar: ({ type, includeInactive }) =>
      chamar(rCategories.GET, { caminho: "/api/categories", query: { type, includeInactive: includeInactive ? "1" : undefined } }),
  }),
  acao({
    nome: "criar_categoria",
    descricao: "Cria categoria (ou subcategoria, com parentId).",
    schema: z.object({ name: z.string().min(1), type: TIPO, parentId: opc(ID), color: COR.optional(), icon: opc(z.string()) }),
    escrita: true,
    executar: async (a) => {
      await daEmpresa({ categoryId: a.parentId });
      return chamar(rCategories.POST, { metodo: "POST", caminho: "/api/categories", corpo: limpo(a) });
    },
  }),
  acao({
    nome: "editar_categoria",
    descricao: "Renomeia, muda a cor ou ativa/desativa (isActive) uma categoria. Desativar é reversível.",
    schema: z.object({ id: ID, name: z.string().min(1).optional(), color: COR.optional(), isActive: z.boolean().optional() }),
    escrita: true,
    executar: ({ id, ...resto }) =>
      chamar(rCategoryId.PATCH, { metodo: "PATCH", caminho: `/api/categories/${id}`, params: { id }, corpo: limpo(resto) }),
  }),
  acao({
    nome: "listar_departamentos",
    descricao: "Departamentos ativos com orçamento mensal.",
    schema: z.object({}),
    escrita: false,
    area: "apoio",
    executar: () => chamar(rDepartments.GET, { caminho: "/api/departments" }),
  }),
  acao({
    nome: "criar_departamento",
    descricao: "Cria departamento.",
    schema: z.object({ name: z.string().min(1), code: opc(z.string()), color: COR.optional() }),
    escrita: true,
    executar: (a) => chamar(rDepartments.POST, { metodo: "POST", caminho: "/api/departments", corpo: limpo(a) }),
  }),
  acao({
    nome: "editar_departamento",
    descricao: "Renomeia, muda a cor ou o orçamento mensal (monthlyBudget) de um departamento.",
    schema: z.object({ id: ID, name: z.string().min(1).optional(), color: COR.optional(), monthlyBudget: z.number().min(0).optional() }),
    escrita: true,
    executar: ({ id, ...resto }) =>
      chamar(rDepartmentId.PATCH, { metodo: "PATCH", caminho: `/api/departments/${id}`, params: { id }, corpo: limpo(resto) }),
  }),

  // ── Contatos (fornecedores/clientes) ──
  acao({
    nome: "listar_contatos",
    descricao: "Fornecedores e clientes, com nº de lançamentos e itens de evento vinculados.",
    schema: z.object({
      search: opc(z.string()).describe("Nome, e-mail, documento ou telefone"),
      type: opc(z.enum(["SUPPLIER", "CLIENT", "BOTH"])),
      includeInactive: z.boolean().optional().describe("Inclui os arquivados"),
    }),
    escrita: false,
    area: "apoio",
    executar: ({ search, type, includeInactive }) =>
      chamar(rContacts.GET, { caminho: "/api/contacts", query: { search, type, includeInactive: includeInactive ? "1" : undefined } }),
  }),
  acao({
    nome: "ver_contato",
    descricao: "Um contato (fornecedor/cliente).",
    schema: z.object({ id: ID }),
    escrita: false,
    area: "apoio",
    executar: ({ id }) => chamar(rContactId.GET, { caminho: `/api/contacts/${id}`, params: { id } }),
  }),
  acao({
    nome: "criar_contato",
    descricao: "Cria fornecedor/cliente.",
    schema: z.object({
      name: z.string().min(1),
      type: z.enum(["SUPPLIER", "CLIENT", "BOTH"]).optional(),
      document: opc(z.string()),
      email: opc(z.string()),
      phone: opc(z.string()),
    }),
    escrita: true,
    executar: (a) => chamar(rContacts.POST, { metodo: "POST", caminho: "/api/contacts", corpo: limpo(a) }),
  }),
  acao({
    nome: "editar_contato",
    descricao: "Edita um contato. isActive=false arquiva, true reativa.",
    schema: z.object({
      id: ID,
      name: z.string().min(1).optional(),
      type: z.enum(["SUPPLIER", "CLIENT", "BOTH"]).optional(),
      document: opc(z.string()),
      email: opc(z.string()),
      phone: opc(z.string()),
      isActive: z.boolean().optional(),
    }),
    escrita: true,
    executar: ({ id, ...resto }) =>
      chamar(rContactId.PATCH, { metodo: "PATCH", caminho: `/api/contacts/${id}`, params: { id }, corpo: limpo(resto) }),
  }),

  // ── Colaboradores e folha ──
  acao({
    nome: "listar_colaboradores",
    descricao: "Colaboradores (salário, dia de pagamento, departamento, status) e a folha mensal dos ativos.",
    schema: z.object({ status: opc(z.enum(["ACTIVE", "PAUSED", "DISMISSED"])), departmentId: opc(ID) }),
    escrita: false,
    executar: (a) => chamar(rEmployees.GET, { caminho: "/api/employees", query: a }),
  }),
  acao({
    nome: "criar_colaborador",
    descricao: "Cadastra colaborador ativo. Gera os próximos 12 meses de salário como lançamentos (categoria Folha de Pagamento).",
    schema: z.object({
      name: z.string().min(1),
      salary: z.number().positive(),
      role: opc(z.string()).describe("Cargo"),
      email: opc(z.string()),
      phone: opc(z.string()),
      departmentId: opc(ID),
      dueDayOfMonth: z.number().int().min(1).max(31).optional().describe("Dia do pagamento (padrão 5)"),
      hireDate: opc(DATA),
      birthDate: opc(DATA),
      notes: opc(z.string()),
    }),
    escrita: true,
    executar: async (a) => {
      await daEmpresa(a);
      return chamar(rEmployees.POST, { metodo: "POST", caminho: "/api/employees", corpo: limpo(a) });
    },
  }),
  acao({
    nome: "editar_colaborador",
    descricao: "Edita colaborador (só os campos enviados). Mudar salário ou dia de pagamento regera os salários futuros pendentes.",
    schema: z.object({
      id: ID,
      name: z.string().min(1).optional(),
      salary: z.number().positive().optional(),
      role: opc(z.string()),
      email: opc(z.string()),
      phone: opc(z.string()),
      departmentId: opc(ID),
      dueDayOfMonth: z.number().int().min(1).max(31).optional(),
      hireDate: DATA.optional(),
      birthDate: opc(DATA),
      dismissDate: opc(DATA),
      notes: opc(z.string()),
    }),
    escrita: true,
    executar: async ({ id, ...resto }) => {
      await daEmpresa(resto);
      return chamar(rEmployeeId.PATCH, { metodo: "PATCH", caminho: `/api/employees/${id}`, params: { id }, corpo: limpo(resto) });
    },
  }),
  acao({
    nome: "mudar_status_colaborador",
    descricao:
      "ACTIVE (reativa e regera salários), PAUSED ou DISMISSED (cancela salários futuros; dismissDate padrão hoje). Reversível voltando para ACTIVE.",
    schema: z.object({ id: ID, status: z.enum(["ACTIVE", "PAUSED", "DISMISSED"]), dismissDate: DATA.optional() }),
    escrita: true,
    executar: ({ id, ...corpo }) =>
      chamar(rEmployeeStatus.POST, { metodo: "POST", caminho: `/api/employees/${id}/status`, params: { id }, corpo }),
  }),
  acao({
    nome: "ver_remuneracao_variavel",
    descricao: "Remuneração variável lançada no mês, por colaborador, e o resumo dos últimos 6 meses.",
    schema: z.object({ month: MES }),
    escrita: false,
    executar: (a) => chamar(rVariable.GET, { caminho: "/api/employees/variable", query: a }),
  }),
  acao({
    nome: "lancar_remuneracao_variavel",
    descricao:
      "Lança ou atualiza a variável do colaborador no mês (cria/atualiza o lançamento 'Remuneração Variável — Nome'). paymentDate opcional; padrão o dia de pagamento dele.",
    schema: z.object({
      employeeId: ID,
      month: MES,
      amount: z.number().positive().describe("Valor > 0 (zerar apaga, e apagar fica de fora do MCP)"),
      description: opc(z.string()),
      paymentDate: opc(DATA),
    }),
    escrita: true,
    executar: async (a) => {
      await daEmpresa({ employeeId: a.employeeId });
      return chamar(rVariable.POST, { metodo: "POST", caminho: "/api/employees/variable", corpo: limpo(a) });
    },
  }),

  // ── Eventos ──
  acao({
    nome: "listar_eventos",
    descricao: "Eventos com orçamento e totais (planejado, aprovado, pago, pendente, saldo).",
    schema: z.object({
      status: opc(z.enum(["PLANNING", "PENDING_APPROVAL", "APPROVED", "IN_PROGRESS", "FINISHED", "CANCELLED"])),
      search: opc(z.string()),
    }),
    escrita: false,
    area: "eventos",
    executar: (a) => chamar(rEvents.GET, { caminho: "/api/events", query: a }),
  }),
  acao({
    nome: "ver_evento",
    descricao: "Um evento com todos os itens de custo (status, categoria, fornecedor, lançamento gerado) e os totais.",
    schema: z.object({ id: ID }),
    escrita: false,
    area: "eventos",
    executar: ({ id }) => chamar(rEventId.GET, { caminho: `/api/events/${id}`, params: { id } }),
  }),
  acao({
    nome: "criar_evento",
    descricao: "Cria evento com orçamento.",
    schema: z.object({
      name: z.string().min(1),
      startDate: DATA,
      budget: z.number().min(0),
      endDate: opc(DATA),
      type: opc(z.string()),
      location: opc(z.string()),
      responsible: opc(z.string()),
      description: opc(z.string()),
      departmentId: opc(ID),
      status: z.enum(["PLANNING", "PENDING_APPROVAL", "APPROVED", "IN_PROGRESS", "FINISHED", "CANCELLED"]).optional(),
    }),
    escrita: true,
    area: "eventos",
    executar: async (a) => {
      await daEmpresa(a);
      return chamar(rEvents.POST, { metodo: "POST", caminho: "/api/events", corpo: limpo(a) });
    },
  }),
  acao({
    nome: "editar_evento",
    descricao: "Edita evento (só os campos enviados), inclusive o status.",
    schema: z.object({
      id: ID,
      name: z.string().min(1).optional(),
      startDate: DATA.optional(),
      endDate: opc(DATA),
      budget: z.number().min(0).optional(),
      type: opc(z.string()),
      location: opc(z.string()),
      responsible: opc(z.string()),
      description: opc(z.string()),
      departmentId: opc(ID),
      status: z.enum(["PLANNING", "PENDING_APPROVAL", "APPROVED", "IN_PROGRESS", "FINISHED", "CANCELLED"]).optional(),
    }),
    escrita: true,
    area: "eventos",
    executar: async ({ id, ...resto }) => {
      await daEmpresa(resto);
      await existe("Evento", await prisma.event.findFirst({ where: { id, companyId: eu().companyId } }));
      return chamar(rEventId.PUT, { metodo: "PUT", caminho: `/api/events/${id}`, params: { id }, corpo: limpo(resto) });
    },
  }),
  acao({
    nome: "criar_item_evento",
    descricao: "Adiciona item de custo ao evento (rascunho ou já pedindo aprovação).",
    schema: z.object({
      eventId: ID,
      description: z.string().min(1),
      amount: z.number().positive(),
      categoryId: opc(ID),
      contactId: opc(ID),
      dueDate: opc(DATA),
      paymentMethod: opc(METODO),
      notes: opc(z.string()),
      requestedBy: opc(z.string()),
      status: z.enum(["DRAFT", "PENDING_APPROVAL"]).optional(),
    }),
    escrita: true,
    area: "eventos",
    executar: async ({ eventId, ...corpo }) => {
      await daEmpresa(corpo);
      return chamar(rEventItems.POST, { metodo: "POST", caminho: `/api/events/${eventId}/items`, params: { id: eventId }, corpo: limpo(corpo) });
    },
  }),
  acao({
    nome: "editar_item_evento",
    descricao: "Edita item de evento (só os campos enviados). Aprovar/recusar têm ferramentas próprias.",
    schema: z.object({
      eventId: ID,
      itemId: ID,
      description: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      categoryId: opc(ID),
      contactId: opc(ID),
      dueDate: opc(DATA),
      paymentMethod: opc(METODO),
      notes: opc(z.string()),
      requestedBy: opc(z.string()),
      status: z.enum(["DRAFT", "PENDING_APPROVAL", "CANCELLED"]).optional(),
    }),
    escrita: true,
    area: "eventos",
    executar: async ({ eventId, itemId, ...corpo }) => {
      await daEmpresa(corpo);
      await existe("Item do evento", await prisma.eventItem.findFirst({ where: { id: itemId, eventId, companyId: eu().companyId } }));
      return chamar(rEventItemId.PUT, {
        metodo: "PUT",
        caminho: `/api/events/${eventId}/items/${itemId}`,
        params: { id: eventId, itemId },
        corpo: limpo(corpo),
      });
    },
  }),
  acao({
    nome: "aprovar_item_evento",
    descricao: "Aprova item (rascunho ou aguardando aprovação): vira lançamento de despesa pendente no financeiro.",
    schema: z.object({ eventId: ID, itemId: ID }),
    escrita: true,
    area: "eventos",
    executar: ({ eventId, itemId }) =>
      chamar(rEventApprove.POST, {
        metodo: "POST",
        caminho: `/api/events/${eventId}/items/${itemId}/approve`,
        params: { id: eventId, itemId },
      }),
  }),
  acao({
    nome: "recusar_item_evento",
    descricao: "Recusa item de evento, com motivo.",
    schema: z.object({ eventId: ID, itemId: ID, reason: opc(z.string()) }),
    escrita: true,
    area: "eventos",
    executar: ({ eventId, itemId, reason }) =>
      chamar(rEventReject.POST, {
        metodo: "POST",
        caminho: `/api/events/${eventId}/items/${itemId}/reject`,
        params: { id: eventId, itemId },
        corpo: limpo({ reason }),
      }),
  }),

  // ── Faturas de cartão ──
  acao({
    nome: "listar_faturas",
    descricao: "Faturas de cartão importadas, com total derivado dos lançamentos vinculados.",
    schema: z.object({ cardId: opc(ID), status: opc(z.enum(["OPEN", "CLOSED", "PAID", "PROCESSING"])) }),
    escrita: false,
    executar: (a) => chamar(rInvoices.GET, { caminho: "/api/invoices", query: a }),
  }),
  acao({
    nome: "ver_fatura",
    descricao: "Uma fatura com os lançamentos vinculados e o resumo (saldo anterior, pagamentos, compras).",
    schema: z.object({ id: ID }),
    escrita: false,
    executar: ({ id }) => chamar(rInvoiceId.GET, { caminho: `/api/invoices/${id}`, params: { id } }),
  }),
  acao({
    nome: "editar_fatura",
    descricao: "Muda status (OPEN, CLOSED, PAID) ou vencimento de uma fatura.",
    schema: z.object({ id: ID, status: z.enum(["OPEN", "CLOSED", "PAID", "PROCESSING"]).optional(), dueDate: DATA.optional() }),
    escrita: true,
    executar: ({ id, ...resto }) =>
      chamar(rInvoiceId.PATCH, { metodo: "PATCH", caminho: `/api/invoices/${id}`, params: { id }, corpo: limpo(resto) }),
  }),
  acao({
    nome: "enviar_fatura",
    descricao:
      "Passo 1 da importação: envia o PDF/imagem da fatura (base64) para a IA extrair os itens. Devolve jobId; acompanhe com ver_extracao_fatura e depois confirmar_fatura. Limite ~4 MB de arquivo.",
    schema: z.object({
      creditCardId: ID,
      fileBase64: z.string().min(100).max(6_000_000),
      mediaType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      fileName: z.string().optional(),
    }),
    escrita: true,
    executar: async ({ creditCardId, fileBase64, mediaType, fileName }) => {
      await daEmpresa({ creditCardId });
      const form = new FormData();
      const bytes = Buffer.from(fileBase64, "base64");
      form.set("file", new File([bytes], fileName ?? "fatura", { type: mediaType }));
      form.set("creditCardId", creditCardId);
      return chamar(rInvoiceUpload.POST, { metodo: "POST", caminho: "/api/invoices/upload", form });
    },
  }),
  acao({
    nome: "ver_extracao_fatura",
    descricao: "Passo 2: status da extração (PROCESSING, READY com os itens sugeridos, ou ERROR).",
    schema: z.object({ jobId: ID }),
    escrita: false,
    executar: ({ jobId }) => chamar(rInvoiceJob.GET, { caminho: `/api/invoices/job/${jobId}`, params: { id: jobId } }),
  }),
  acao({
    nome: "confirmar_fatura",
    descricao:
      "Passo 3: grava a fatura e cria os lançamentos dos itens incluídos (mesma conciliação da tela: a soma tem que bater com o total ou com as compras do período, salvo confirmAnyway). Só fatura nova: reimportar (que substitui lançamentos) fica na tela.",
    schema: z.object({
      creditCardId: ID,
      referenceMonth: MES,
      dueDate: DATA,
      paymentDate: opc(DATA),
      totalAmount: z.number(),
      items: z.array(
        z.object({
          date: DATA,
          description: z.string().min(1),
          amount: z.number().describe("Positivo = compra; negativo = estorno/crédito"),
          establishment: opc(z.string()).default(null),
          installmentInfo: opc(z.string()).default(null),
          categoryId: opc(ID).default(null),
          departmentId: opc(ID).default(null),
          include: z.boolean().default(true),
        })
      ),
      summary: opc(
        z.object({
          previousBalance: z.number().nullable(),
          paymentsCredits: z.number().nullable(),
          purchasesDebits: z.number().nullable(),
          totalToPay: z.number().nullable(),
        })
      ),
      summaryOnly: z.boolean().optional().describe("Importa só o total como um lançamento"),
      summaryCategoryId: opc(ID),
      confirmAnyway: z.boolean().optional().describe("Grava mesmo com a conciliação não batendo"),
    }),
    escrita: true,
    executar: async (a) => {
      const companyId = eu().companyId;
      await daEmpresa({ creditCardId: a.creditCardId, categoryId: a.summaryCategoryId });
      const referenceMonth = parseInt(a.referenceMonth.replace("-", ""));
      const jaExiste = await prisma.creditCardInvoice.findFirst({
        where: { companyId, creditCardId: a.creditCardId, referenceMonth },
        select: { id: true },
      });
      if (jaExiste) {
        throw new Recusa(
          `Já existe fatura deste cartão em ${a.referenceMonth} (${jaExiste.id}). Reimportar apaga os lançamentos não pagos dela: faça pela tela de Faturas.`
        );
      }
      return chamar(rInvoiceConfirm.POST, { metodo: "POST", caminho: "/api/invoices/confirm", corpo: limpo(a) });
    },
  }),

  // ── Equipe ──
  acao({
    nome: "ver_equipe",
    descricao: "Membros da equipe (papel), convites pendentes e o seu papel.",
    schema: z.object({}),
    escrita: false,
    executar: () => chamar(rTeam.GET, { caminho: "/api/team" }),
  }),
  acao({
    nome: "adicionar_membro",
    descricao:
      "Só ADMIN. Adiciona pessoa à equipe pelo e-mail: se ela já tem login vira membro na hora; senão gera convite (devolve o token do link /convite/<token>).",
    schema: z.object({ email: z.string().email(), role: PAPEL }),
    escrita: true,
    executar: (a) => chamar(rTeam.POST, { metodo: "POST", caminho: "/api/team", corpo: a }),
  }),
  acao({
    nome: "convidar_membro",
    descricao: "Só ADMIN. Gera convite (7 dias) para o e-mail; devolve o token do link /convite/<token>.",
    schema: z.object({ email: z.string().email(), role: PAPEL }),
    escrita: true,
    executar: (a) => chamar(rInvite.POST, { metodo: "POST", caminho: "/api/team/invite", corpo: a }),
  }),
  acao({
    nome: "reenviar_convite",
    descricao: "Só ADMIN. Expira o convite e gera um novo para o mesmo e-mail e papel.",
    schema: z.object({ inviteId: ID }),
    escrita: true,
    executar: (a) => chamar(rInviteResend.POST, { metodo: "POST", caminho: "/api/team/invite/resend", corpo: a }),
  }),
  acao({
    nome: "revogar_convite",
    descricao: "Só ADMIN. Expira um convite pendente (token do convite, de ver_equipe).",
    schema: z.object({ token: ID }),
    escrita: true,
    executar: async (a) => {
      if (eu().role !== "ADMIN") throw new Recusa("Apenas administradores podem revogar convites.");
      return chamar(rInvite.DELETE, { metodo: "DELETE", caminho: "/api/team/invite", corpo: a });
    },
  }),
  acao({
    nome: "mudar_papel_membro",
    descricao: "Só ADMIN. Muda o papel de um membro (memberId de ver_equipe). Não rebaixa o último ADMIN.",
    schema: z.object({ memberId: ID, role: PAPEL }),
    escrita: true,
    executar: ({ memberId, role }) =>
      chamar(rTeamMember.PATCH, { metodo: "PATCH", caminho: `/api/team/${memberId}`, params: { memberId }, corpo: { role } }),
  }),

  // ── Configurações da empresa ──
  acao({
    nome: "ver_configuracoes",
    descricao: "Dados da empresa: nome, CNPJ, e-mail, telefone, nº de pessoas, moeda e fuso.",
    schema: z.object({}),
    escrita: false,
    executar: () => chamar(rSettings.GET, { caminho: "/api/settings" }),
  }),
  acao({
    nome: "editar_configuracoes",
    descricao: "Edita os dados da empresa (só os enviados). CNPJ é validado.",
    schema: z.object({
      name: z.string().min(1).optional(),
      document: z.string().optional().describe("CNPJ; vazio limpa"),
      email: z.string().optional(),
      phone: z.string().optional(),
      headcount: z.number().int().min(0).optional(),
      currency: z.string().optional(),
      timezone: z.string().optional(),
    }),
    escrita: true,
    executar: (a) => chamar(rSettings.PATCH, { metodo: "PATCH", caminho: "/api/settings", corpo: limpo(a) }),
  }),
];

export function instrucoesPara(nome: string): string {
  return (
    "MCP do Core Finance (financeiro da Core): lançamentos a pagar/receber, contas, cartões e faturas, categorias, " +
    "departamentos, contatos, colaboradores e folha, eventos, relatórios e painel. " +
    `Você age como ${nome}: mesma empresa, mesmo papel e mesmas regras da tela. ` +
    "Valores em reais (amount sempre positivo; type INCOME/EXPENSE diz o sentido). Datas AAAA-MM-DD, meses AAAA-MM. " +
    "Comece por quem_sou_eu; ids vêm das listagens (listar_categorias, listar_contas…). Nada aqui apaga dados."
  );
}
