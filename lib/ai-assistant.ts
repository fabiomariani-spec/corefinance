// ─── Claude AI Financial Assistant ───────────────────────────────────────────
// Agente com acesso em tempo real ao banco de dados financeiro via tool_use

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/formatters";
import {
  format,
  startOfMonth,
  endOfMonth,
  subDays,
  startOfDay,
  addDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const anthropic = new Anthropic();

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const FINANCIAL_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_cash_position",
    description:
      "Retorna a posição atual de caixa: saldo total nas contas bancárias, total a receber, total a pagar, burn rate diário e runway (dias de caixa disponível).",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_month_summary",
    description:
      "Retorna o resumo financeiro de um mês: entradas realizadas, saídas realizadas, entradas previstas, saídas previstas, resultado líquido e projeção final.",
    input_schema: {
      type: "object" as const,
      properties: {
        month: {
          type: "string",
          description: "Mês no formato YYYY-MM. Se omitido, usa o mês atual.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pending_payments",
    description:
      "Lista pagamentos pendentes/vencidos ordenados por data de vencimento. Use para responder 'o que preciso pagar?' ou 'quais contas estão em atraso?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Número máximo de registros. Padrão: 10.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pending_receivables",
    description:
      "Lista recebíveis pendentes/vencidos ordenados por data de vencimento. Use para responder 'o que tenho a receber?' ou 'quais clientes estão em atraso?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Número máximo de registros. Padrão: 10.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_expenses_by_category",
    description:
      "Retorna despesas agrupadas por categoria. Use para análise de onde o dinheiro está sendo gasto.",
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: {
          type: "string",
          description: "Data inicial YYYY-MM-DD. Padrão: início do mês atual.",
        },
        endDate: {
          type: "string",
          description: "Data final YYYY-MM-DD. Padrão: fim do mês atual.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recent_transactions",
    description:
      "Lista os lançamentos financeiros mais recentes. Útil para ver o histórico de movimentações.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Número máximo de registros. Padrão: 10.",
        },
        type: {
          type: "string",
          enum: ["INCOME", "EXPENSE"],
          description:
            "Filtrar por tipo: INCOME (entradas/receitas) ou EXPENSE (saídas/despesas).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_upcoming_cash_flow",
    description:
      "Mostra os próximos N dias com vencimentos de pagamentos e recebimentos, útil para planejamento de curto prazo.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Quantos dias à frente verificar. Padrão: 7.",
        },
      },
      required: [],
    },
  },
];

// ─── Tool Implementations ─────────────────────────────────────────────────────

async function getCashPosition(companyId: string) {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, balance: true },
  });

  const accountsWithBalance = await Promise.all(
    accounts.map(async (acc) => {
      const [inc, exp] = await Promise.all([
        prisma.transaction.aggregate({
          where: { accountId: acc.id, type: "INCOME", status: "RECEIVED" },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { accountId: acc.id, type: "EXPENSE", status: "PAID" },
          _sum: { amount: true },
        }),
      ]);
      return {
        name: acc.name,
        balance:
          Number(acc.balance) +
          Number(inc._sum.amount ?? 0) -
          Number(exp._sum.amount ?? 0),
      };
    })
  );

  const accountBalance = accountsWithBalance.reduce((s, a) => s + a.balance, 0);

  const [totalReceivablesAgg, totalPayablesAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        companyId,
        type: "INCOME",
        status: { in: ["PENDING", "PREDICTED", "OVERDUE"] },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        companyId,
        type: "EXPENSE",
        status: { in: ["PENDING", "PREDICTED", "OVERDUE"] },
      },
      _sum: { amount: true },
    }),
  ]);

  const today = startOfDay(new Date());
  const recentExp = await prisma.transaction.aggregate({
    where: {
      companyId,
      type: "EXPENSE",
      status: "PAID",
      competenceDate: { gte: subDays(today, 30), lte: today },
    },
    _sum: { amount: true },
  });

  const burnRate = Number(recentExp._sum.amount ?? 0) / 30;
  const totalReceivables = Number(totalReceivablesAgg._sum.amount ?? 0);
  const totalPayables = Number(totalPayablesAgg._sum.amount ?? 0);
  const runway =
    burnRate > 0 ? Math.min(365, Math.floor(accountBalance / burnRate)) : 365;

  return {
    saldoAtual: formatCurrency(accountBalance),
    contas: accountsWithBalance.map((a) => ({
      nome: a.name,
      saldo: formatCurrency(a.balance),
    })),
    aReceber: formatCurrency(totalReceivables),
    aPagar: formatCurrency(totalPayables),
    posicaoLiquida: formatCurrency(totalReceivables - totalPayables),
    burnRateDiario: formatCurrency(burnRate),
    runway: runway >= 365 ? "365+ dias" : `${runway} dias`,
  };
}

async function getMonthSummary(companyId: string, month?: string) {
  const ref = month ? new Date(month + "-01T12:00:00") : new Date();
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);

  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      competenceDate: { gte: start, lte: end },
      status: { not: "CANCELLED" },
    },
    select: { type: true, amount: true, status: true },
  });

  const s = transactions.reduce(
    (acc, t) => {
      const amt = Number(t.amount);
      if (t.type === "INCOME") {
        if (t.status === "RECEIVED") acc.income += amt;
        else acc.predictedIncome += amt;
      } else {
        if (t.status === "PAID") acc.expenses += amt;
        else acc.predictedExpenses += amt;
      }
      return acc;
    },
    { income: 0, expenses: 0, predictedIncome: 0, predictedExpenses: 0 }
  );

  return {
    mes: format(ref, "MMMM 'de' yyyy", { locale: ptBR }),
    entradasRealizadas: formatCurrency(s.income),
    saidasRealizadas: formatCurrency(s.expenses),
    entradasPrevistas: formatCurrency(s.predictedIncome),
    saidasPrevistas: formatCurrency(s.predictedExpenses),
    resultadoAtual: formatCurrency(s.income - s.expenses),
    resultadoProjetado: formatCurrency(
      s.income + s.predictedIncome - (s.expenses + s.predictedExpenses)
    ),
    totalEntradasPrevisto: formatCurrency(s.income + s.predictedIncome),
    totalSaidasPrevisto: formatCurrency(s.expenses + s.predictedExpenses),
  };
}

async function getPendingPayments(companyId: string, limit = 10) {
  const today = startOfDay(new Date());
  const txs = await prisma.transaction.findMany({
    where: {
      companyId,
      type: "EXPENSE",
      status: { in: ["PENDING", "OVERDUE"] },
    },
    include: {
      category: { select: { name: true } },
      contact: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: limit,
  });

  return txs.map((t) => ({
    descricao: t.description,
    valor: formatCurrency(Number(t.amount)),
    vencimento: t.dueDate
      ? format(new Date(t.dueDate), "dd/MM/yyyy")
      : "sem vencimento",
    atrasado: t.dueDate ? startOfDay(new Date(t.dueDate)) < today : false,
    categoria: t.category?.name ?? null,
    fornecedor: t.contact?.name ?? null,
    status: t.status,
  }));
}

async function getPendingReceivables(companyId: string, limit = 10) {
  const today = startOfDay(new Date());
  const txs = await prisma.transaction.findMany({
    where: {
      companyId,
      type: "INCOME",
      status: { in: ["PENDING", "OVERDUE"] },
    },
    include: {
      category: { select: { name: true } },
      contact: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: limit,
  });

  return txs.map((t) => ({
    descricao: t.description,
    valor: formatCurrency(Number(t.amount)),
    vencimento: t.dueDate
      ? format(new Date(t.dueDate), "dd/MM/yyyy")
      : "sem vencimento",
    atrasado: t.dueDate ? startOfDay(new Date(t.dueDate)) < today : false,
    cliente: t.contact?.name ?? null,
    categoria: t.category?.name ?? null,
    status: t.status,
  }));
}

async function getExpensesByCategory(
  companyId: string,
  startDate?: string,
  endDate?: string
) {
  const start = startDate ? new Date(startDate) : startOfMonth(new Date());
  const end = endDate ? new Date(endDate) : endOfMonth(new Date());

  const txs = await prisma.transaction.findMany({
    where: {
      companyId,
      type: "EXPENSE",
      status: { in: ["PAID", "PENDING", "OVERDUE"] },
      competenceDate: { gte: start, lte: end },
    },
    include: { category: { select: { name: true } } },
  });

  const total = txs.reduce((s, t) => s + Number(t.amount), 0);
  const catMap: Record<string, number> = {};
  for (const t of txs) {
    const key = t.category?.name ?? "Sem Categoria";
    catMap[key] = (catMap[key] ?? 0) + Number(t.amount);
  }

  return {
    periodo: `${format(start, "dd/MM")} a ${format(end, "dd/MM/yyyy")}`,
    totalDespesas: formatCurrency(total),
    categorias: Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, valor]) => ({
        nome,
        valor: formatCurrency(valor),
        percentual: total > 0 ? `${((valor / total) * 100).toFixed(1)}%` : "0%",
      })),
  };
}

async function getRecentTransactions(
  companyId: string,
  limit = 10,
  type?: string
) {
  const txs = await prisma.transaction.findMany({
    where: {
      companyId,
      ...(type ? { type: type as "INCOME" | "EXPENSE" } : {}),
      status: { not: "CANCELLED" },
    },
    include: { category: { select: { name: true } } },
    orderBy: { competenceDate: "desc" },
    take: limit,
  });

  return txs.map((t) => ({
    data: format(new Date(t.competenceDate), "dd/MM/yyyy"),
    descricao: t.description,
    tipo: t.type === "INCOME" ? "Entrada" : "Saída",
    valor: formatCurrency(Number(t.amount)),
    categoria: t.category?.name ?? "—",
    status: t.status,
  }));
}

async function getUpcomingCashFlow(companyId: string, days = 7) {
  const today = startOfDay(new Date());
  const end = addDays(today, days);

  const [receivables, payables] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        companyId,
        type: "INCOME",
        status: { in: ["PENDING", "PREDICTED"] },
        dueDate: { gte: today, lte: end },
      },
      include: { contact: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: "EXPENSE",
        status: { in: ["PENDING", "PREDICTED"] },
        dueDate: { gte: today, lte: end },
      },
      include: { contact: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const totalReceivables = receivables.reduce((s, t) => s + Number(t.amount), 0);
  const totalPayables = payables.reduce((s, t) => s + Number(t.amount), 0);

  return {
    periodo: `Próximos ${days} dias (até ${format(end, "dd/MM")})`,
    aReceber: {
      total: formatCurrency(totalReceivables),
      itens: receivables.map((t) => ({
        descricao: t.description,
        valor: formatCurrency(Number(t.amount)),
        vencimento: t.dueDate ? format(new Date(t.dueDate), "dd/MM") : "—",
        cliente: t.contact?.name ?? null,
      })),
    },
    aPagar: {
      total: formatCurrency(totalPayables),
      itens: payables.map((t) => ({
        descricao: t.description,
        valor: formatCurrency(Number(t.amount)),
        vencimento: t.dueDate ? format(new Date(t.dueDate), "dd/MM") : "—",
      })),
    },
    saldoPrevisto: formatCurrency(totalReceivables - totalPayables),
  };
}

// ─── Tool Router ──────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  companyId: string
): Promise<unknown> {
  switch (name) {
    case "get_cash_position":
      return getCashPosition(companyId);
    case "get_month_summary":
      return getMonthSummary(companyId, input.month as string | undefined);
    case "get_pending_payments":
      return getPendingPayments(
        companyId,
        (input.limit as number | undefined) ?? 10
      );
    case "get_pending_receivables":
      return getPendingReceivables(
        companyId,
        (input.limit as number | undefined) ?? 10
      );
    case "get_expenses_by_category":
      return getExpensesByCategory(
        companyId,
        input.startDate as string | undefined,
        input.endDate as string | undefined
      );
    case "get_recent_transactions":
      return getRecentTransactions(
        companyId,
        (input.limit as number | undefined) ?? 10,
        input.type as string | undefined
      );
    case "get_upcoming_cash_flow":
      return getUpcomingCashFlow(
        companyId,
        (input.days as number | undefined) ?? 7
      );
    default:
      return { erro: "Ferramenta desconhecida" };
  }
}

// ─── Main Agent ───────────────────────────────────────────────────────────────

export async function processFinancialMessage(
  userMessage: string,
  companyId: string,
  senderName?: string
): Promise<string> {
  const systemPrompt = `Você é o assistente financeiro pessoal de ${senderName ?? "o gestor"} da empresa. Você tem acesso aos dados financeiros em tempo real através das ferramentas disponíveis.

REGRAS:
- Responda SEMPRE em português brasileiro, de forma objetiva e direta
- Use formatação WhatsApp: *negrito* para valores e números importantes
- Use emojis apropriados: 💰 saldo, 📥 a receber, 📤 a pagar, ⚠️ alerta, 📊 relatório, ✅ positivo, 🔴 negativo
- Para valores monetários, use "R$ X.XXX,XX"
- Seja conciso — máximo 4 parágrafos por resposta
- Se o saldo ou resultado for negativo, sinalize claramente com ⚠️
- Use sempre as ferramentas para buscar dados reais, nunca invente números
- Data de hoje: *${format(new Date(), "EEEE, dd/MM/yyyy", { locale: ptBR })}*`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Agentic loop — max 5 rounds
  for (let round = 0; round < 5; round++) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: FINANCIAL_TOOLS,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock
        ? (textBlock as Anthropic.TextBlock).text
        : "Não consegui processar sua pergunta.";
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          try {
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              companyId
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ erro: String(err) }),
              is_error: true,
            });
          }
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break;
  }

  return "Desculpe, não consegui processar sua solicitação no momento. Tente novamente em instantes.";
}

// ─── Report Builders (for cron jobs — no API cost) ───────────────────────────

export async function buildDailyReport(companyId: string): Promise<string> {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const [cashPos, monthTxs, todayPayables, todayReceivables] = await Promise.all([
    getCashPosition(companyId),
    prisma.transaction.findMany({
      where: {
        companyId,
        competenceDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELLED" },
      },
      select: { type: true, amount: true, status: true },
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: "EXPENSE",
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { gte: today, lt: tomorrow },
      },
      include: { category: { select: { name: true } } },
      orderBy: { amount: "desc" },
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: "INCOME",
        status: { in: ["PENDING", "PREDICTED"] },
        dueDate: { gte: today, lt: tomorrow },
      },
      include: { contact: { select: { name: true } } },
      orderBy: { amount: "desc" },
    }),
  ]);

  const monthSummary = monthTxs.reduce(
    (s, t) => {
      const amt = Number(t.amount);
      if (t.type === "INCOME") {
        if (t.status === "RECEIVED") s.income += amt;
        else s.predictedIncome += amt;
      } else {
        if (t.status === "PAID") s.expenses += amt;
        else s.predictedExpenses += amt;
      }
      return s;
    },
    { income: 0, expenses: 0, predictedIncome: 0, predictedExpenses: 0 }
  );

  const lines: string[] = [];
  const dayLabel = format(today, "EEEE, dd/MM/yyyy", { locale: ptBR });

  lines.push(`☀️ *Bom dia! Resumo Financeiro*`);
  lines.push(`_${dayLabel}_\n`);

  lines.push(`💰 *Saldo em Caixa:* ${cashPos.saldoAtual}`);
  if (cashPos.contas.length > 1) {
    for (const c of cashPos.contas) {
      lines.push(`   · ${c.nome}: ${c.saldo}`);
    }
  }

  lines.push(`\n📥 *A Receber:* ${cashPos.aReceber}`);
  lines.push(`📤 *A Pagar:* ${cashPos.aPagar}`);
  lines.push(`⚖️ *Posição Líquida:* ${cashPos.posicaoLiquida}`);
  lines.push(`⏱️ *Runway:* ${cashPos.runway}`);

  // Month summary
  const monthLabel = format(today, "MMMM", { locale: ptBR });
  lines.push(`\n📊 *${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}:*`);
  lines.push(`   Entradas: ${formatCurrency(monthSummary.income)} realizadas`);
  if (monthSummary.predictedIncome > 0) {
    lines.push(
      `   + ${formatCurrency(monthSummary.predictedIncome)} previstas`
    );
  }
  lines.push(`   Saídas: ${formatCurrency(monthSummary.expenses)} realizadas`);
  if (monthSummary.predictedExpenses > 0) {
    lines.push(
      `   + ${formatCurrency(monthSummary.predictedExpenses)} previstas`
    );
  }
  const resultado = monthSummary.income - monthSummary.expenses;
  lines.push(
    `   Resultado: ${resultado >= 0 ? "✅" : "⚠️"} *${formatCurrency(resultado)}*`
  );

  // Today's payables
  if (todayPayables.length > 0) {
    lines.push(`\n📤 *Vence Hoje:*`);
    for (const t of todayPayables.slice(0, 5)) {
      const isOverdue = t.status === "OVERDUE";
      lines.push(
        `   ${isOverdue ? "🔴" : "·"} ${t.description}: *${formatCurrency(Number(t.amount))}*${isOverdue ? " ⚠️ atrasado" : ""}`
      );
    }
    if (todayPayables.length > 5) {
      lines.push(`   _...e mais ${todayPayables.length - 5} pagamento(s)_`);
    }
  } else {
    lines.push(`\n✅ Nenhum pagamento com vencimento hoje.`);
  }

  // Today's receivables
  if (todayReceivables.length > 0) {
    lines.push(`\n📥 *Recebimentos Hoje:*`);
    for (const t of todayReceivables.slice(0, 5)) {
      lines.push(
        `   · ${t.description}: *${formatCurrency(Number(t.amount))}*${t.contact ? ` (${t.contact.name})` : ""}`
      );
    }
  } else {
    lines.push(`\n📥 Nenhum recebimento previsto hoje.`);
  }

  lines.push(
    `\n_Envie uma pergunta para consultar qualquer dado financeiro_ 💬`
  );

  return lines.join("\n");
}

export async function buildWeeklyReport(companyId: string): Promise<string> {
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(subDays(today, 1), { weekStartsOn: 1 }); // Last week Mon
  const weekEnd = endOfWeek(subDays(today, 1), { weekStartsOn: 1 }); // Last week Sun
  const nextWeekEnd = addDays(today, 7);

  const [cashPos, weekTxs, upcomingPayables, overduePayables] =
    await Promise.all([
      getCashPosition(companyId),
      prisma.transaction.findMany({
        where: {
          companyId,
          competenceDate: { gte: weekStart, lte: weekEnd },
          status: { not: "CANCELLED" },
        },
        include: { category: { select: { name: true } } },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          type: "EXPENSE",
          status: { in: ["PENDING", "PREDICTED"] },
          dueDate: { gte: today, lte: nextWeekEnd },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          type: "EXPENSE",
          status: "OVERDUE",
        },
        orderBy: { amount: "desc" },
      }),
    ]);

  const weekIncome = weekTxs
    .filter((t) => t.type === "INCOME")
    .reduce((s, t) => s + Number(t.amount), 0);
  const weekExpenses = weekTxs
    .filter((t) => t.type === "EXPENSE")
    .reduce((s, t) => s + Number(t.amount), 0);

  // Expenses by category for the week
  const catMap: Record<string, number> = {};
  for (const t of weekTxs.filter((t) => t.type === "EXPENSE")) {
    const key = t.category?.name ?? "Sem Categoria";
    catMap[key] = (catMap[key] ?? 0) + Number(t.amount);
  }
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const lines: string[] = [];
  const weekLabel = `${format(weekStart, "dd/MM", { locale: ptBR })} a ${format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}`;

  lines.push(`📅 *Resumo Semanal*`);
  lines.push(`_${weekLabel}_\n`);

  lines.push(`💰 *Posição de Caixa:* ${cashPos.saldoAtual}`);
  lines.push(`⏱️ *Runway:* ${cashPos.runway} | Burn: ${cashPos.burnRateDiario}/dia\n`);

  const resultado = weekIncome - weekExpenses;
  lines.push(`📊 *Movimentação da Semana:*`);
  lines.push(`   Entradas: *${formatCurrency(weekIncome)}*`);
  lines.push(`   Saídas:   *${formatCurrency(weekExpenses)}*`);
  lines.push(
    `   Resultado: ${resultado >= 0 ? "✅" : "⚠️"} *${formatCurrency(resultado)}*`
  );

  if (topCats.length > 0) {
    lines.push(`\n🏆 *Top despesas da semana:*`);
    topCats.forEach(([nome, valor], i) => {
      const pct =
        weekExpenses > 0 ? `(${((valor / weekExpenses) * 100).toFixed(0)}%)` : "";
      lines.push(`   ${i + 1}. ${nome}: ${formatCurrency(valor)} ${pct}`);
    });
  }

  if (overduePayables.length > 0) {
    const totalOverdue = overduePayables.reduce(
      (s, t) => s + Number(t.amount),
      0
    );
    lines.push(
      `\n⚠️ *Pagamentos em Atraso:* ${overduePayables.length} itens — *${formatCurrency(totalOverdue)}*`
    );
  }

  if (upcomingPayables.length > 0) {
    lines.push(`\n📤 *A Pagar nos Próximos 7 Dias:*`);
    for (const t of upcomingPayables) {
      const dueStr = t.dueDate
        ? format(new Date(t.dueDate), "dd/MM")
        : "sem data";
      lines.push(
        `   · ${t.description}: ${formatCurrency(Number(t.amount))} (${dueStr})`
      );
    }
  }

  lines.push(
    `\n_Envie uma pergunta para consultar qualquer dado financeiro_ 💬`
  );

  return lines.join("\n");
}
