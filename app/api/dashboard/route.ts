import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  subQuarters,
  subYears,
  startOfDay,
  endOfDay,
  addDays,
  format,
} from "date-fns";

type Period = "month" | "quarter" | "year";

function getRange(period: Period, refDate: Date) {
  if (period === "quarter") {
    return {
      start: startOfQuarter(refDate),
      end: endOfQuarter(refDate),
      prevStart: startOfQuarter(subQuarters(refDate, 1)),
      prevEnd: endOfQuarter(subQuarters(refDate, 1)),
    };
  }
  if (period === "year") {
    return {
      start: startOfYear(refDate),
      end: endOfYear(refDate),
      prevStart: startOfYear(subYears(refDate, 1)),
      prevEnd: endOfYear(subYears(refDate, 1)),
    };
  }
  return {
    start: startOfMonth(refDate),
    end: endOfMonth(refDate),
    prevStart: startOfMonth(subMonths(refDate, 1)),
    prevEnd: endOfMonth(subMonths(refDate, 1)),
  };
}

export const GET = withAuth(async ({ companyId, req }) => {
  const { searchParams } = req.nextUrl;

  const refDate = searchParams.get("date") ? new Date(searchParams.get("date")!) : new Date();
  const period = (searchParams.get("period") ?? "month") as Period;

    const { start, end, prevStart, prevEnd } = getRange(period, refDate);

    // ── 8 queries em PARALELO via Promise.all ───────────────────────────────
    // Antes eram sequenciais, somando ~1-2s. Agora ~150-300ms (max da query
    // mais lenta). Os 2 grandes (currentTransactions + allTrendTxs) tem
    // cobertura de índice em (companyId, competenceDate).
    const burn3mStart = startOfMonth(subMonths(refDate, 3));
    const burn3mEnd = endOfMonth(subMonths(refDate, 1));
    const trend12mStart = startOfMonth(subMonths(refDate, 12));
    const trend12mEnd = endOfMonth(refDate);

    const [
      allAccounts,
      txByAccount,
      company,
      currentTransactions,
      prevTransactions,
      upcomingPayables,
      creditCardTotals,
      allDepartments,
      burn3mTxs,
      allTrendTxs,
    ] = await Promise.all([
      prisma.account.findMany({
        where: { companyId, isActive: true },
        select: { id: true, balance: true },
      }),
      prisma.transaction.groupBy({
        by: ["accountId", "type"],
        where: {
          companyId,
          accountId: { not: null },
          OR: [
            { type: "INCOME", status: "RECEIVED" },
            { type: "EXPENSE", status: "PAID" },
          ],
        },
        _sum: { amount: true },
      }),
      prisma.company.findFirst({
        where: { id: companyId },
        select: { headcount: true },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          competenceDate: { gte: start, lte: end },
          status: { not: "CANCELLED" },
        },
        include: { category: true, department: true },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          competenceDate: { gte: prevStart, lte: prevEnd },
          status: { not: "CANCELLED" },
        },
        select: {
          type: true,
          amount: true,
          status: true,
          isPredicted: true,
          contactId: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          type: "EXPENSE",
          status: { in: ["PENDING", "PREDICTED"] },
          dueDate: {
            gte: startOfDay(new Date()),
            lte: endOfDay(addDays(new Date(), 30)),
          },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
        include: { category: true },
      }),
      prisma.creditCard.findMany({
        where: { companyId, isActive: true },
        include: {
          transactions: {
            where: {
              competenceDate: { gte: start, lte: end },
              status: { not: "CANCELLED" },
            },
          },
        },
      }),
      prisma.department.findMany({
        where: { companyId, isActive: true },
        select: { id: true, monthlyBudget: true },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          competenceDate: { gte: burn3mStart, lte: burn3mEnd },
          status: { in: ["RECEIVED", "PAID"] },
        },
        select: { type: true, amount: true, competenceDate: true },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          competenceDate: { gte: trend12mStart, lte: trend12mEnd },
          status: { in: ["RECEIVED", "PAID"] },
        },
        select: { type: true, amount: true, competenceDate: true, contactId: true },
      }),
    ]);

    const accIncMap: Record<string, number> = {};
    const accExpMap: Record<string, number> = {};
    for (const r of txByAccount) {
      if (!r.accountId) continue;
      if (r.type === "INCOME") accIncMap[r.accountId] = Number(r._sum.amount ?? 0);
      else accExpMap[r.accountId] = Number(r._sum.amount ?? 0);
    }

    const totalCashBalance = allAccounts.reduce(
      (s, acc) => s + Number(acc.balance) + (accIncMap[acc.id] ?? 0) - (accExpMap[acc.id] ?? 0),
      0
    );

    const headcount = company?.headcount ?? 0;

    // ── Current period aggregates ─────────────────────────────────────────────
    // Regime de CAIXA: realizado = só RECEIVED/PAID. Antes usava !isPredicted,
    // que contava boleto/conta PENDENTE como receita/despesa realizada (inflava).
    const currentIncome = currentTransactions
      .filter((t) => t.type === "INCOME" && t.status === "RECEIVED")
      .reduce((s, t) => s + Number(t.amount), 0);

    const currentExpenses = currentTransactions
      .filter((t) => t.type === "EXPENSE" && t.status === "PAID")
      .reduce((s, t) => s + Number(t.amount), 0);

    // A receber / a pagar do mês (reais, ainda não realizados) — cards separados.
    const incomeReceivable = currentTransactions
      .filter((t) => t.type === "INCOME" && (t.status === "PENDING" || t.status === "OVERDUE"))
      .reduce((s, t) => s + Number(t.amount), 0);
    const expensePayable = currentTransactions
      .filter((t) => t.type === "EXPENSE" && (t.status === "PENDING" || t.status === "OVERDUE"))
      .reduce((s, t) => s + Number(t.amount), 0);

    const currentIncomePredicted = currentTransactions
      .filter((t) => t.type === "INCOME" && t.isPredicted)
      .reduce((s, t) => s + Number(t.amount), 0);

    const currentExpensesPredicted = currentTransactions
      .filter((t) => t.type === "EXPENSE" && t.isPredicted)
      .reduce((s, t) => s + Number(t.amount), 0);

    const netProfit = currentIncome - currentExpenses;
    const netMargin = currentIncome > 0 ? (netProfit / currentIncome) * 100 : 0;

    // ── Previous period aggregates ────────────────────────────────────────────
    const previousIncome = prevTransactions
      .filter((t) => t.type === "INCOME" && t.status === "RECEIVED")
      .reduce((s, t) => s + Number(t.amount), 0);
    const previousExpenses = prevTransactions
      .filter((t) => t.type === "EXPENSE" && t.status === "PAID")
      .reduce((s, t) => s + Number(t.amount), 0);

    // ── Burn Rate (data já buscada no Promise.all acima) ──────────────────────
    const burnRate = Math.max(0, currentExpenses - currentIncome);

    const burn3mByMonth: Record<string, { inc: number; exp: number }> = {};
    for (const t of burn3mTxs) {
      const key = format(new Date(t.competenceDate), "yyyy-MM");
      if (!burn3mByMonth[key]) burn3mByMonth[key] = { inc: 0, exp: 0 };
      if (t.type === "INCOME") burn3mByMonth[key].inc += Number(t.amount);
      else burn3mByMonth[key].exp += Number(t.amount);
    }
    // Janela FIXA de 3 meses (refMonth-3 .. refMonth-1): divide por 3, não pelo
    // nº de meses COM movimento. Antes, 1 mês de burn R$30k virava média R$30k
    // (÷1) em vez de R$10k (÷3) — runway falsamente curto. Meses sem burn são 0.
    const burn3mTotal = Object.values(burn3mByMonth).reduce((s, m) => s + Math.max(0, m.exp - m.inc), 0);
    const avgBurnRate3m = burn3mTotal / 3;
    const runway = avgBurnRate3m > 0 ? totalCashBalance / avgBurnRate3m : -1;

    // ── Revenue per Employee ──────────────────────────────────────────────────
    const revenuePerEmployee = headcount > 0 ? currentIncome / headcount : null;
    const prevRevenuePerEmployee = headcount > 0 && previousIncome > 0 ? previousIncome / headcount : null;

    // ── Expenses by Department ────────────────────────────────────────────────
    const budgetMultiplier = period === "quarter" ? 3 : period === "year" ? 12 : 1;
    const deptBudgetMap: Record<string, number> = {};
    allDepartments.forEach((d) => {
      deptBudgetMap[d.id] = Number(d.monthlyBudget ?? 0) * budgetMultiplier;
    });

    const byDepartmentMap: Record<string, { name: string; amount: number; color: string; budget: number }> = {};
    currentTransactions
      .filter((t) => t.type === "EXPENSE" && t.status === "PAID")
      .forEach((t) => {
        const key = t.departmentId ?? "sem-depto";
        if (!byDepartmentMap[key]) {
          byDepartmentMap[key] = {
            name: t.department?.name ?? "Sem Departamento",
            amount: 0,
            color: t.department?.color ?? "#6b7280",
            budget: t.departmentId ? (deptBudgetMap[t.departmentId] ?? 0) : 0,
          };
        }
        byDepartmentMap[key].amount += Number(t.amount);
      });
    const byDepartment = Object.values(byDepartmentMap).sort((a, b) => b.amount - a.amount);

    // ── Income by Category ──────────────────────────────────────────────────
    const byIncomeCategoryMap: Record<string, { name: string; amount: number; color: string }> = {};
    currentTransactions
      .filter((t) => t.type === "INCOME" && t.status === "RECEIVED")
      .forEach((t) => {
        const key = t.categoryId ?? "sem-cat";
        if (!byIncomeCategoryMap[key]) {
          byIncomeCategoryMap[key] = {
            name: t.category?.name ?? "Sem Categoria",
            amount: 0,
            color: t.category?.color ?? "#6b7280",
          };
        }
        byIncomeCategoryMap[key].amount += Number(t.amount);
      });
    const byIncomeCategory = Object.values(byIncomeCategoryMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // ── Expenses by Category ──────────────────────────────────────────────────
    const byCategoryMap: Record<string, { name: string; amount: number; color: string }> = {};
    currentTransactions
      .filter((t) => t.type === "EXPENSE" && t.category && t.status === "PAID")
      .forEach((t) => {
        const key = t.categoryId ?? "sem-cat";
        if (!byCategoryMap[key]) {
          byCategoryMap[key] = {
            name: t.category?.name ?? "Sem Categoria",
            amount: 0,
            color: t.category?.color ?? "#6b7280",
          };
        }
        byCategoryMap[key].amount += Number(t.amount);
      });
    const byCategory = Object.values(byCategoryMap).sort((a, b) => b.amount - a.amount).slice(0, 10);

    // ── Churn ─────────────────────────────────────────────────────────────────
    const currentClientIds = new Set(
      currentTransactions
        .filter((t) => t.type === "INCOME" && t.status === "RECEIVED" && t.contactId)
        .map((t) => t.contactId as string)
    );
    const prevClientIds = new Set(
      prevTransactions
        .filter((t) => t.type === "INCOME" && t.status === "RECEIVED" && t.contactId)
        .map((t) => t.contactId as string)
    );
    const churnedClientIds = [...prevClientIds].filter((id) => !currentClientIds.has(id));
    const customerChurnRate =
      prevClientIds.size > 0 ? (churnedClientIds.length / prevClientIds.size) * 100 : 0;

    const prevRevenueWithContact = prevTransactions
      .filter((t) => t.type === "INCOME" && t.status === "RECEIVED" && t.contactId)
      .reduce((s, t) => s + Number(t.amount), 0);
    const churnedRevenue = prevTransactions
      .filter(
        (t) =>
          t.type === "INCOME" &&
          t.status === "RECEIVED" &&
          t.contactId &&
          churnedClientIds.includes(t.contactId)
      )
      .reduce((s, t) => s + Number(t.amount), 0);
    const revenueChurnRate =
      prevRevenueWithContact > 0 ? (churnedRevenue / prevRevenueWithContact) * 100 : 0;

    // ── Top Expenses ──────────────────────────────────────────────────────────
    const topExpenses = currentTransactions
      .filter((t) => t.type === "EXPENSE" && t.status === "PAID")
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 8)
      .map((t) => ({
        description: t.description,
        amount: Number(t.amount),
        category: t.category?.name,
        categoryColor: t.category?.color,
      }));

    // ── Credit card committed ─────────────────────────────────────────────────
    // Comprometido no cartão = compras (EXPENSE) menos estornos (INCOME), sem
    // previstos. Antes somava o amount de qualquer tipo, então estorno de fatura
    // (gravado como INCOME no mesmo cartão) era contado COMO gasto, inflando.
    const creditCardCommitted = creditCardTotals.reduce((sum, card) => {
      return sum + card.transactions.reduce((s, t) => {
        if (t.isPredicted) return s;
        return s + (t.type === "INCOME" ? -Number(t.amount) : Number(t.amount));
      }, 0);
    }, 0);

    // ── 12-Month trend + churn (allTrendTxs já buscada no Promise.all acima) ─

    // Group by month
    const trendByMonth: Record<string, typeof allTrendTxs> = {};
    for (const t of allTrendTxs) {
      const key = format(new Date(t.competenceDate), "yyyy-MM");
      if (!trendByMonth[key]) trendByMonth[key] = [];
      trendByMonth[key].push(t);
    }

    const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
      const month = subMonths(refDate, 11 - i);
      const key = format(month, "yyyy-MM");
      const txs = trendByMonth[key] ?? [];
      const income = txs.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
      const expenses = txs.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);
      return {
        month: month.toISOString(),
        income,
        expenses,
        profit: income - expenses,
        cashFlow: income - expenses,
      };
    });

    // Churn trend from same data
    const churnTrend12m = Array.from({ length: 12 }, (_, i) => {
      const month = subMonths(refDate, 11 - i);
      const key = format(month, "yyyy-MM");
      const prevKey = format(subMonths(month, 1), "yyyy-MM");
      const curTxs = trendByMonth[key] ?? [];
      const pTxs = trendByMonth[prevKey] ?? [];

      const curIds = new Set(curTxs.filter((t) => t.type === "INCOME" && t.contactId).map((t) => t.contactId as string));
      const prevIds = new Set(pTxs.filter((t) => t.type === "INCOME" && t.contactId).map((t) => t.contactId as string));
      const churned = [...prevIds].filter((id) => !curIds.has(id));
      const custChurn = prevIds.size > 0 ? (churned.length / prevIds.size) * 100 : 0;
      const prevRev = pTxs.filter((t) => t.type === "INCOME" && t.contactId).reduce((s, t) => s + Number(t.amount), 0);
      const churnRev = pTxs
        .filter((t) => t.type === "INCOME" && t.contactId && churned.includes(t.contactId as string))
        .reduce((s, t) => s + Number(t.amount), 0);
      const revChurn = prevRev > 0 ? (churnRev / prevRev) * 100 : 0;

      return {
        month: month.toISOString(),
        customerChurnRate: custChurn,
        revenueChurnRate: revChurn,
      };
    });

    // ── Payables summary ──────────────────────────────────────────────────────
    const totalPayables = upcomingPayables.reduce((s, t) => s + Number(t.amount), 0);

    // ── Projection ────────────────────────────────────────────────────────────
    // Projeção = realizado + a-receber/a-pagar (pendente real) + previsto.
    const projectedIncome = currentIncome + incomeReceivable + currentIncomePredicted;
    const projectedExpenses = currentExpenses + expensePayable + currentExpensesPredicted;
    const projectedProfit = projectedIncome - projectedExpenses;

  return NextResponse.json({
    currentMonth: {
      income: currentIncome,
      expenses: currentExpenses,
      netProfit,
      netMargin,
      incomeReceivable,
      expensePayable,
      incomePredicted: currentIncomePredicted,
      expensesPredicted: currentExpensesPredicted,
    },
    previousMonth: {
      income: previousIncome,
      expenses: previousExpenses,
      netProfit: previousIncome - previousExpenses,
    },
    projection: {
      income: projectedIncome,
      expenses: projectedExpenses,
      profit: projectedProfit,
      margin: projectedIncome > 0 ? (projectedProfit / projectedIncome) * 100 : 0,
    },
    totalCashBalance,
    burnRate,
    avgBurnRate3m,
    runway,
    headcount,
    revenuePerEmployee,
    prevRevenuePerEmployee,
    byDepartment,
    byIncomeCategory,
    byCategory,
    churn: {
      customerChurnRate,
      revenueChurnRate,
      churnedClients: churnedClientIds.length,
      prevClientCount: prevClientIds.size,
    },
    monthlyTrend,
    churnTrend12m,
    topExpenses,
    upcomingPayables: upcomingPayables.map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      dueDate: t.dueDate,
      category: t.category?.name,
      categoryColor: t.category?.color,
    })),
    totalPayables,
    creditCardCommitted,
  }, {
    headers: {
      "Cache-Control": "private, max-age=15, stale-while-revalidate=120",
    },
  });
}, { errorMsg: "Erro ao carregar dashboard" });
