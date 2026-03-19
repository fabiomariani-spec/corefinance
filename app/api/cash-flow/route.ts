import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import {
  addDays,
  startOfDay,
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const today = startOfDay(new Date());

    // Month for the extrato/bar chart
    const monthParam = searchParams.get("month");
    const monthRef = monthParam ? new Date(monthParam + "-01T12:00:00") : new Date();
    const monthStart = startOfMonth(monthRef);
    const monthEnd = endOfMonth(monthRef);

    // ─── 1. Account balances (single grouped query instead of N*2) ──────────
    const accounts = await prisma.account.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, balance: true, color: true, type: true },
    });

    // Company-level totals + per-account totals in 2 grouped queries
    const [txByAccount, companyTotals] = await Promise.all([
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
      prisma.transaction.groupBy({
        by: ["type"],
        where: {
          companyId,
          OR: [
            { type: "INCOME", status: "RECEIVED" },
            { type: "EXPENSE", status: "PAID" },
          ],
        },
        _sum: { amount: true },
      }),
    ]);

    const companyIncTotal = Number(companyTotals.find((r) => r.type === "INCOME")?._sum.amount ?? 0);
    const companyExpTotal = Number(companyTotals.find((r) => r.type === "EXPENSE")?._sum.amount ?? 0);
    const baseAccountBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
    const accountBalance = baseAccountBalance + companyIncTotal - companyExpTotal;

    // Per-account balances from grouped data
    const accIncMap: Record<string, number> = {};
    const accExpMap: Record<string, number> = {};
    for (const r of txByAccount) {
      if (!r.accountId) continue;
      if (r.type === "INCOME") accIncMap[r.accountId] = Number(r._sum.amount ?? 0);
      else accExpMap[r.accountId] = Number(r._sum.amount ?? 0);
    }
    const accountsWithBalance = accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      color: acc.color,
      type: acc.type,
      balance: Number(acc.balance) + (accIncMap[acc.id] ?? 0) - (accExpMap[acc.id] ?? 0),
    }));

    // ─── 2. Burn rate (single grouped query) ───────────────────────────────────
    const burnStart = subDays(today, 30);
    const burnData = await prisma.transaction.groupBy({
      by: ["type"],
      where: {
        companyId,
        competenceDate: { gte: burnStart, lte: today },
        OR: [
          { type: "INCOME", status: "RECEIVED" },
          { type: "EXPENSE", status: "PAID" },
        ],
      },
      _sum: { amount: true },
    });

    const burnRate = Number(burnData.find((r) => r.type === "EXPENSE")?._sum.amount ?? 0) / 30;
    const avgDailyIncome = Number(burnData.find((r) => r.type === "INCOME")?._sum.amount ?? 0) / 30;
    const runway =
      burnRate > 0 ? Math.min(365, Math.floor(accountBalance / burnRate)) : 365;

    // ─── 3a. Receivables & Payables filtrados pelo mês (KPIs + tabelas) ────────
    const pendingStatusFilter = { in: ["PENDING", "PREDICTED", "OVERDUE"] as ("PENDING" | "PREDICTED" | "OVERDUE")[] };
    const monthDueFilter = {
      OR: [
        { dueDate: { gte: monthStart, lte: monthEnd } },
        { dueDate: null, competenceDate: { gte: monthStart, lte: monthEnd } },
      ],
    };

    // Sequential to avoid pool exhaustion
    const receivables = await prisma.transaction.findMany({
      where: { companyId, type: "INCOME", status: pendingStatusFilter, ...monthDueFilter },
      include: {
        category: { select: { name: true, color: true } },
        contact: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });
    const payables = await prisma.transaction.findMany({
      where: { companyId, type: "EXPENSE", status: pendingStatusFilter, ...monthDueFilter },
      include: {
        category: { select: { name: true, color: true } },
        contact: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const totalReceivables = receivables.reduce((s, t) => s + Number(t.amount), 0);
    const totalPayables = payables.reduce((s, t) => s + Number(t.amount), 0);

    // ─── 3b. Todos os pendentes futuros para projeção 60 dias ─────────────────
    const allFutureReceivables = await prisma.transaction.findMany({
      where: { companyId, type: "INCOME", status: pendingStatusFilter, dueDate: { gte: today } },
      select: { dueDate: true, amount: true },
    });
    const allFuturePayables = await prisma.transaction.findMany({
      where: { companyId, type: "EXPENSE", status: pendingStatusFilter, dueDate: { gte: today } },
      select: { dueDate: true, amount: true },
    });

    // ─── 4. Projeção de caixa (60 dias) ──────────────────────────────────────
    const projectionDays = 60;
    const projMap: Record<string, { income: number; expense: number }> = {};

    for (const tx of allFutureReceivables) {
      if (!tx.dueDate) continue;
      const key = format(startOfDay(new Date(tx.dueDate)), "yyyy-MM-dd");
      if (!projMap[key]) projMap[key] = { income: 0, expense: 0 };
      projMap[key].income += Number(tx.amount);
    }
    for (const tx of allFuturePayables) {
      if (!tx.dueDate) continue;
      const key = format(startOfDay(new Date(tx.dueDate)), "yyyy-MM-dd");
      if (!projMap[key]) projMap[key] = { income: 0, expense: 0 };
      projMap[key].expense += Number(tx.amount);
    }

    let runningBalance = accountBalance;
    const projection = [];
    for (let i = 0; i <= projectionDays; i++) {
      const day = addDays(today, i);
      const key = format(day, "yyyy-MM-dd");
      const dayData = projMap[key] ?? { income: 0, expense: 0 };
      if (i > 0) runningBalance += dayData.income - dayData.expense;
      projection.push({
        date: key,
        dateLabel: format(day, "dd/MM", { locale: ptBR }),
        balance: Math.round(runningBalance * 100) / 100,
        income: dayData.income,
        expense: dayData.expense,
        isToday: i === 0,
      });
    }

    const firstNegativeDay = projection.find((p) => p.balance < 0 && !p.isToday) ?? null;
    const minProjectedBalance = Math.min(...projection.map((p) => p.balance));

    // ─── 5. Transações do mês (extrato + bar chart) ───────────────────────────
    const monthTransactions = await prisma.transaction.findMany({
      where: {
        companyId,
        // Cash-flow view: filter by dueDate when available, fall back to competenceDate
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          { dueDate: null, competenceDate: { gte: monthStart, lte: monthEnd } },
        ],
        status: { not: "CANCELLED" },
      },
      include: {
        category: { select: { name: true, color: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const monthSummary = monthTransactions.reduce(
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

    // Daily bar chart data
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const dailyData = days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayTxs = monthTransactions.filter(
        (t) => format(new Date(t.competenceDate), "yyyy-MM-dd") === dayStr
      );
      return {
        date: dayStr,
        dateLabel: format(day, "dd/MM", { locale: ptBR }),
        income: dayTxs
          .filter((t) => t.type === "INCOME")
          .reduce((s, t) => s + Number(t.amount), 0),
        expenses: dayTxs
          .filter((t) => t.type === "EXPENSE")
          .reduce((s, t) => s + Number(t.amount), 0),
        isToday: isToday(day),
      };
    });

    return NextResponse.json({
      accountBalance,
      accounts: accountsWithBalance,
      burnRate,
      avgDailyIncome,
      runway,
      totalReceivables,
      totalPayables,
      receivables: receivables.map((t) => ({ ...t, amount: Number(t.amount) })),
      payables: payables.map((t) => ({ ...t, amount: Number(t.amount) })),
      projection,
      firstNegativeDay,
      minProjectedBalance,
      monthSummary,
      monthTransactions: monthTransactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
      dailyData,
    });
  } catch (error) {
    console.error("Cash flow error:", error);
    return NextResponse.json({ error: "Erro ao carregar fluxo de caixa", detail: String(error) }, { status: 500 });
  }
}
