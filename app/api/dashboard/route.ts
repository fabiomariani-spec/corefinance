import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
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

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const refDate = searchParams.get("date") ? new Date(searchParams.get("date")!) : new Date();
    const period = (searchParams.get("period") ?? "month") as Period;

    const { start, end, prevStart, prevEnd } = getRange(period, refDate);

    // ── 1. Cash balance (single grouped query) ──────────────────────────────
    const allAccounts = await prisma.account.findMany({
      where: { companyId, isActive: true },
      select: { id: true, balance: true },
    });

    const txByAccount = await prisma.transaction.groupBy({
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
    });

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

    // ── 2. Company settings ─────────────────────────────────────────────────
    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { headcount: true },
    });
    const headcount = company?.headcount ?? 0;

    // ── 3. Current & previous period transactions (sequential) ──────────────
    const currentTransactions = await prisma.transaction.findMany({
      where: {
        companyId,
        competenceDate: { gte: start, lte: end },
        status: { not: "CANCELLED" },
      },
      include: { category: true, department: true },
    });

    const prevTransactions = await prisma.transaction.findMany({
      where: {
        companyId,
        competenceDate: { gte: prevStart, lte: prevEnd },
        status: { not: "CANCELLED" },
      },
      select: {
        type: true,
        amount: true,
        isPredicted: true,
        contactId: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });

    const upcomingPayables = await prisma.transaction.findMany({
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
    });

    const creditCardTotals = await prisma.creditCard.findMany({
      where: { companyId, isActive: true },
      include: {
        transactions: {
          where: {
            competenceDate: { gte: start, lte: end },
            status: { not: "CANCELLED" },
          },
        },
      },
    });

    const allDepartments = await prisma.department.findMany({
      where: { companyId, isActive: true },
      select: { id: true, monthlyBudget: true },
    });

    // ── Current period aggregates ─────────────────────────────────────────────
    const currentIncome = currentTransactions
      .filter((t) => t.type === "INCOME" && !t.isPredicted)
      .reduce((s, t) => s + Number(t.amount), 0);

    const currentExpenses = currentTransactions
      .filter((t) => t.type === "EXPENSE" && !t.isPredicted)
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
      .filter((t) => t.type === "INCOME" && !t.isPredicted)
      .reduce((s, t) => s + Number(t.amount), 0);
    const previousExpenses = prevTransactions
      .filter((t) => t.type === "EXPENSE" && !t.isPredicted)
      .reduce((s, t) => s + Number(t.amount), 0);

    // ── Burn Rate (single query for last 3 months) ────────────────────────────
    const burnRate = Math.max(0, currentExpenses - currentIncome);
    const burn3mStart = startOfMonth(subMonths(refDate, 3));
    const burn3mEnd = endOfMonth(subMonths(refDate, 1));

    const burn3mTxs = await prisma.transaction.findMany({
      where: {
        companyId,
        competenceDate: { gte: burn3mStart, lte: burn3mEnd },
        isPredicted: false,
        status: { not: "CANCELLED" },
      },
      select: { type: true, amount: true, competenceDate: true },
    });

    const burn3mByMonth: Record<string, { inc: number; exp: number }> = {};
    for (const t of burn3mTxs) {
      const key = format(new Date(t.competenceDate), "yyyy-MM");
      if (!burn3mByMonth[key]) burn3mByMonth[key] = { inc: 0, exp: 0 };
      if (t.type === "INCOME") burn3mByMonth[key].inc += Number(t.amount);
      else burn3mByMonth[key].exp += Number(t.amount);
    }
    const burn3mValues = Object.values(burn3mByMonth).map((m) => Math.max(0, m.exp - m.inc));
    const avgBurnRate3m = burn3mValues.length > 0 ? burn3mValues.reduce((s, v) => s + v, 0) / burn3mValues.length : 0;
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
      .filter((t) => t.type === "EXPENSE" && !t.isPredicted)
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
      .filter((t) => t.type === "INCOME" && !t.isPredicted)
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
      .filter((t) => t.type === "EXPENSE" && t.category && !t.isPredicted)
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
        .filter((t) => t.type === "INCOME" && !t.isPredicted && t.contactId)
        .map((t) => t.contactId as string)
    );
    const prevClientIds = new Set(
      prevTransactions
        .filter((t) => t.type === "INCOME" && !t.isPredicted && t.contactId)
        .map((t) => t.contactId as string)
    );
    const churnedClientIds = [...prevClientIds].filter((id) => !currentClientIds.has(id));
    const customerChurnRate =
      prevClientIds.size > 0 ? (churnedClientIds.length / prevClientIds.size) * 100 : 0;

    const prevRevenueWithContact = prevTransactions
      .filter((t) => t.type === "INCOME" && !t.isPredicted && t.contactId)
      .reduce((s, t) => s + Number(t.amount), 0);
    const churnedRevenue = prevTransactions
      .filter(
        (t) =>
          t.type === "INCOME" &&
          !t.isPredicted &&
          t.contactId &&
          churnedClientIds.includes(t.contactId)
      )
      .reduce((s, t) => s + Number(t.amount), 0);
    const revenueChurnRate =
      prevRevenueWithContact > 0 ? (churnedRevenue / prevRevenueWithContact) * 100 : 0;

    // ── Top Expenses ──────────────────────────────────────────────────────────
    const topExpenses = currentTransactions
      .filter((t) => t.type === "EXPENSE" && !t.isPredicted)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 8)
      .map((t) => ({
        description: t.description,
        amount: Number(t.amount),
        category: t.category?.name,
        categoryColor: t.category?.color,
      }));

    // ── Credit card committed ─────────────────────────────────────────────────
    const creditCardCommitted = creditCardTotals.reduce((sum, card) => {
      return sum + card.transactions.reduce((s, t) => s + Number(t.amount), 0);
    }, 0);

    // ── 12-Month trend + churn (SINGLE query for all 12 months) ──────────────
    const trend12mStart = startOfMonth(subMonths(refDate, 12));
    const trend12mEnd = endOfMonth(refDate);

    const allTrendTxs = await prisma.transaction.findMany({
      where: {
        companyId,
        competenceDate: { gte: trend12mStart, lte: trend12mEnd },
        isPredicted: false,
        status: { not: "CANCELLED" },
      },
      select: { type: true, amount: true, competenceDate: true, contactId: true },
    });

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
    const projectedIncome = currentIncome + currentIncomePredicted;
    const projectedExpenses = currentExpenses + currentExpensesPredicted;
    const projectedProfit = projectedIncome - projectedExpenses;

    return NextResponse.json({
      currentMonth: {
        income: currentIncome,
        expenses: currentExpenses,
        netProfit,
        netMargin,
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
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Erro ao carregar dashboard", detail: String(error) }, { status: 500 });
  }
}
