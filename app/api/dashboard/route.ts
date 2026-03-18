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
  // default: month
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

    // ── Cash balance across all accounts ─────────────────────────────────────
    const allAccounts = await prisma.account.findMany({
      where: { companyId, isActive: true },
      select: { id: true, balance: true },
    });
    const cashBalances = await Promise.all(
      allAccounts.map(async (acc) => {
        const [incomeAgg, expenseAgg] = await Promise.all([
          prisma.transaction.aggregate({
            where: { accountId: acc.id, type: "INCOME", status: "RECEIVED" },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { accountId: acc.id, type: "EXPENSE", status: "PAID" },
            _sum: { amount: true },
          }),
        ]);
        return (
          Number(acc.balance) +
          Number(incomeAgg._sum.amount ?? 0) -
          Number(expenseAgg._sum.amount ?? 0)
        );
      })
    );
    const totalCashBalance = cashBalances.reduce((s, b) => s + b, 0);

    // ── Company settings (headcount) ─────────────────────────────────────────
    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { headcount: true },
    });
    const headcount = company?.headcount ?? 0;

    // ── Current & previous period transactions ────────────────────────────────
    const [currentTransactions, prevTransactions, upcomingPayables, creditCardTotals, allDepartments] =
      await Promise.all([
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
      ]);

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

    // ── Burn Rate ─────────────────────────────────────────────────────────────
    const burnRate = Math.max(0, currentExpenses - currentIncome);

    // Average burn rate over last 3 months (always monthly, regardless of period)
    const last3MonthsData = await Promise.all(
      Array.from({ length: 3 }, (_, i) => subMonths(refDate, i + 1)).map(async (m) => {
        const txs = await prisma.transaction.findMany({
          where: {
            companyId,
            competenceDate: { gte: startOfMonth(m), lte: endOfMonth(m) },
            isPredicted: false,
            status: { not: "CANCELLED" },
          },
          select: { type: true, amount: true },
        });
        const inc = txs.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
        const exp = txs.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);
        return Math.max(0, exp - inc);
      })
    );
    const avgBurnRate3m = last3MonthsData.reduce((s, v) => s + v, 0) / 3;

    // Runway in months (-1 = infinite, i.e. not burning)
    const runway = avgBurnRate3m > 0 ? totalCashBalance / avgBurnRate3m : -1;

    // ── Revenue per Employee ──────────────────────────────────────────────────
    const revenuePerEmployee = headcount > 0 ? currentIncome / headcount : null;
    const prevRevenuePerEmployee = headcount > 0 && previousIncome > 0 ? previousIncome / headcount : null;

    // ── Expenses by Department ────────────────────────────────────────────────
    // Scale monthlyBudget by period (quarter = 3x, year = 12x)
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

    // ── Income by Category (Receita por Produto) ──────────────────────────────
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

    // ── Churn (based on contactId on INCOME transactions) ─────────────────────
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

    // ── 12-Month trend (always monthly) ───────────────────────────────────────
    const monthlyTrend = await Promise.all(
      Array.from({ length: 12 }, (_, i) => subMonths(refDate, 11 - i)).map(async (month) => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const txs = await prisma.transaction.findMany({
          where: {
            companyId,
            competenceDate: { gte: mStart, lte: mEnd },
            isPredicted: false,
            status: { not: "CANCELLED" },
          },
          select: { type: true, amount: true, contactId: true },
        });
        const income = txs
          .filter((t) => t.type === "INCOME")
          .reduce((s, t) => s + Number(t.amount), 0);
        const expenses = txs
          .filter((t) => t.type === "EXPENSE")
          .reduce((s, t) => s + Number(t.amount), 0);
        return {
          month: month.toISOString(),
          income,
          expenses,
          profit: income - expenses,
          cashFlow: income - expenses,
        };
      })
    );

    // ── 12-Month churn trend ──────────────────────────────────────────────────
    const churnTrend12m = await Promise.all(
      Array.from({ length: 12 }, (_, i) => subMonths(refDate, 11 - i)).map(async (month) => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const pStart = startOfMonth(subMonths(month, 1));
        const pEnd = endOfMonth(subMonths(month, 1));

        const [mTxs, pTxs] = await Promise.all([
          prisma.transaction.findMany({
            where: {
              companyId,
              type: "INCOME",
              isPredicted: false,
              status: { not: "CANCELLED" },
              competenceDate: { gte: mStart, lte: mEnd },
              contactId: { not: null },
            },
            select: { contactId: true, amount: true },
          }),
          prisma.transaction.findMany({
            where: {
              companyId,
              type: "INCOME",
              isPredicted: false,
              status: { not: "CANCELLED" },
              competenceDate: { gte: pStart, lte: pEnd },
              contactId: { not: null },
            },
            select: { contactId: true, amount: true },
          }),
        ]);

        const curIds = new Set(mTxs.map((t) => t.contactId as string));
        const prevIds = new Set(pTxs.map((t) => t.contactId as string));
        const churned = [...prevIds].filter((id) => !curIds.has(id));
        const custChurn = prevIds.size > 0 ? (churned.length / prevIds.size) * 100 : 0;
        const prevRev = pTxs.reduce((s, t) => s + Number(t.amount), 0);
        const churnRev = pTxs
          .filter((t) => churned.includes(t.contactId as string))
          .reduce((s, t) => s + Number(t.amount), 0);
        const revChurn = prevRev > 0 ? (churnRev / prevRev) * 100 : 0;

        return {
          month: month.toISOString(),
          customerChurnRate: custChurn,
          revenueChurnRate: revChurn,
        };
      })
    );

    // ── Payables summary ──────────────────────────────────────────────────────
    const totalPayables = upcomingPayables.reduce((s, t) => s + Number(t.amount), 0);

    // ── Projection ────────────────────────────────────────────────────────────
    const projectedIncome = currentIncome + currentIncomePredicted;
    const projectedExpenses = currentExpenses + currentExpensesPredicted;
    const projectedProfit = projectedIncome - projectedExpenses;

    return NextResponse.json({
      // ── Core period metrics ─────────────────────────────────────────────────
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
      // ── Cash & survival ─────────────────────────────────────────────────────
      totalCashBalance,
      burnRate,
      avgBurnRate3m,
      runway, // -1 means infinite (not burning)
      // ── People ──────────────────────────────────────────────────────────────
      headcount,
      revenuePerEmployee,
      prevRevenuePerEmployee,
      // ── Breakdowns ──────────────────────────────────────────────────────────
      byDepartment,
      byIncomeCategory,
      byCategory,
      // ── Churn ───────────────────────────────────────────────────────────────
      churn: {
        customerChurnRate,
        revenueChurnRate,
        churnedClients: churnedClientIds.length,
        prevClientCount: prevClientIds.size,
      },
      // ── Trends ──────────────────────────────────────────────────────────────
      monthlyTrend,
      churnTrend12m,
      // ── Other (kept for compatibility) ──────────────────────────────────────
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
    return NextResponse.json({ error: "Erro ao carregar dashboard" }, { status: 500 });
  }
}
