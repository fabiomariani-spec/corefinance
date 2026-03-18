import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCompanyId } from "@/lib/auth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function pct(n: number, dec = 1) {
  return `${n.toFixed(dec)}%`;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(data: Record<string, unknown>, period: string): string {
  const cur = data.currentMonth as {
    income: number; expenses: number; netProfit: number; netMargin: number;
    incomePredicted: number; expensesPredicted: number;
  };
  const prev = data.previousMonth as { income: number; expenses: number; netProfit: number };
  const burnRate = Number(data.burnRate ?? 0);
  const avgBurnRate3m = Number(data.avgBurnRate3m ?? 0);
  const runway = Number(data.runway ?? -1);
  const totalCashBalance = Number(data.totalCashBalance ?? 0);
  const headcount = Number(data.headcount ?? 0);
  const revenuePerEmployee = data.revenuePerEmployee != null ? Number(data.revenuePerEmployee) : null;
  const prevRevenuePerEmployee = data.prevRevenuePerEmployee != null ? Number(data.prevRevenuePerEmployee) : null;

  const byDepartment = (data.byDepartment as { name: string; amount: number; budget: number }[]) ?? [];
  const byIncomeCategory = (data.byIncomeCategory as { name: string; amount: number }[]) ?? [];
  const churn = data.churn as {
    customerChurnRate: number; revenueChurnRate: number;
    churnedClients: number; prevClientCount: number;
  };
  const monthlyTrend = (data.monthlyTrend as {
    month: string; income: number; expenses: number; profit: number;
  }[]) ?? [];

  const periodName =
    period === "month" ? "MENSAL" : period === "quarter" ? "TRIMESTRAL" : "ANUAL";

  const incomeVar =
    prev.income > 0 ? ((cur.income - prev.income) / prev.income) * 100 : 0;
  const expensesVar =
    prev.expenses > 0 ? ((cur.expenses - prev.expenses) / prev.expenses) * 100 : 0;
  const profitVar =
    Math.abs(prev.netProfit) > 0
      ? ((cur.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 100
      : 0;

  const runwayText =
    runway === -1 ? "Indefinido (sem queima de caixa)" : `${runway.toFixed(1)} meses`;

  const revPerEmpVar =
    revenuePerEmployee != null && prevRevenuePerEmployee != null && prevRevenuePerEmployee > 0
      ? ((revenuePerEmployee - prevRevenuePerEmployee) / prevRevenuePerEmployee) * 100
      : null;

  const deptLines = byDepartment
    .slice(0, 8)
    .map((d) => {
      const budgetInfo =
        d.budget > 0
          ? ` | budget: ${fmt(d.budget)} | utilização: ${pct((d.amount / d.budget) * 100, 0)}`
          : "";
      const pctTotal =
        cur.expenses > 0 ? ` (${pct((d.amount / cur.expenses) * 100, 0)} das despesas)` : "";
      return `  • ${d.name}: ${fmt(d.amount)}${pctTotal}${budgetInfo}`;
    })
    .join("\n");

  const incomeCatLines = byIncomeCategory
    .slice(0, 6)
    .map((c) => {
      const pctTotal =
        cur.income > 0 ? ` (${pct((c.amount / cur.income) * 100, 0)})` : "";
      return `  • ${c.name}: ${fmt(c.amount)}${pctTotal}`;
    })
    .join("\n");

  const trendLast6 = monthlyTrend
    .slice(-6)
    .map((m) => {
      const margin = m.income > 0 ? ((m.profit / m.income) * 100).toFixed(0) : "0";
      return `  • ${m.month.slice(0, 7)}: R$ ${fmt(m.income)} receita | R$ ${fmt(m.expenses)} despesas | margem ${margin}%`;
    })
    .join("\n");

  return `Você é um CFO experiente especialista em startups brasileiras de alto crescimento. Analise os dados financeiros abaixo com olhar crítico e cirúrgico. Seu foco: identificar onde a empresa está perdendo dinheiro, quais riscos são imediatos, e quais alavancas mover agora para reduzir custo e aumentar margem.

━━━ DADOS FINANCEIROS — PERÍODO ${periodName} ━━━

RESULTADO CORRENTE:
  • Receita: ${fmt(cur.income)} (${incomeVar >= 0 ? "+" : ""}${pct(incomeVar)} vs período anterior: ${fmt(prev.income)})
  • Despesas: ${fmt(cur.expenses)} (${expensesVar >= 0 ? "+" : ""}${pct(expensesVar)} vs período anterior: ${fmt(prev.expenses)})
  • Lucro Líquido: ${fmt(cur.netProfit)} (${profitVar >= 0 ? "+" : ""}${pct(profitVar)} vs ${fmt(prev.netProfit)})
  • Margem Líquida: ${pct(cur.netMargin)}
  • Receita total prevista no período: ${fmt(cur.income + cur.incomePredicted)}
  • Despesas totais previstas no período: ${fmt(cur.expenses + cur.expensesPredicted)}

SAÚDE DE CAIXA:
  • Caixa Total disponível: ${fmt(totalCashBalance)}
  • Burn Rate atual: ${fmt(burnRate)}/mês
  • Burn Rate médio 3 meses: ${fmt(avgBurnRate3m)}/mês
  • Runway estimado: ${runwayText}

EFICIÊNCIA DE PESSOAS:
  • Headcount: ${headcount > 0 ? `${headcount} colaboradores` : "não informado"}
  • Receita por Funcionário: ${revenuePerEmployee != null ? fmt(revenuePerEmployee) : "N/A"}${revPerEmpVar != null ? ` (${revPerEmpVar >= 0 ? "+" : ""}${pct(revPerEmpVar)} vs período anterior)` : ""}

ESTRUTURA DE CUSTOS — POR DEPARTAMENTO:
${deptLines || "  (sem dados por departamento)"}

MIX DE RECEITA — POR CATEGORIA/PRODUTO:
${incomeCatLines || "  (sem categorias de receita)"}

RETENÇÃO E CHURN:
  • Churn de Clientes: ${pct(churn.customerChurnRate)} (${churn.churnedClients} de ${churn.prevClientCount} clientes cancelaram)
  • Churn de Receita: ${pct(churn.revenueChurnRate)} (receita perdida)

TENDÊNCIA — ÚLTIMOS 6 MESES:
${trendLast6 || "  (dados insuficientes)"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Responda EXATAMENTE neste formato (mantenha os emojis e títulos):

## 📊 Análise Executiva
[2 parágrafos. Seja direto como num board meeting. Use os números. Diga o que está funcionando e o que está ameaçando o negócio. Sem rodeios.]

## 💡 Dica Principal
[UMA ação concreta para implementar essa semana. Específico, acionável, com impacto estimado em R$ ou %.]

## ⚠️ Pontos de Atenção
- [Alerta 1 — mais urgente, com o número que justifica]
- [Alerta 2 — com contexto]
- [Alerta 3 — com contexto]

Máximo 380 palavras. Linguagem de C-level, sem jargão vazio.`;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth guard (must complete before starting stream)
  try {
    await getCompanyId();
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { data: Record<string, unknown>; period: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { data, period } = body;
  const prompt = buildPrompt(data, period);
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode("\n\n[Erro ao gerar análise. Verifique a chave da API.]")
        );
        console.error("AI insight stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
