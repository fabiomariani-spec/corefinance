import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") ?? "dre";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Fix timezone: append T12:00:00 to avoid UTC midnight shifting to previous day in BR
    const start = startDate ? new Date(startDate + "T00:00:00") : startOfMonth(new Date());
    const end = endDate ? new Date(endDate + "T23:59:59") : endOfMonth(new Date());

    // Same date logic as /api/transactions: dueDate OR competenceDate
    const transactions = await prisma.transaction.findMany({
      where: {
        companyId,
        OR: [
          { dueDate: { gte: start, lte: end } },
          { dueDate: null, competenceDate: { gte: start, lte: end } },
        ],
        status: { not: "CANCELLED" },
        isPredicted: false,
      },
      include: {
        category: true,
        department: true,
        contact: true,
      },
      orderBy: { competenceDate: "asc" },
    });

    // ── DRE Gerencial ─────────────────────────────────────────────────────────
    if (type === "dre") {
      const income = transactions
        .filter((t) => t.type === "INCOME")
        .reduce((s, t) => s + Number(t.amount), 0);

      const expenses = transactions
        .filter((t) => t.type === "EXPENSE")
        .reduce((s, t) => s + Number(t.amount), 0);

      const byCategory: Record<string, { name: string; amount: number; percentage: number }> = {};

      transactions
        .filter((t) => t.type === "EXPENSE" && t.category)
        .forEach((t) => {
          const key = t.categoryId!;
          if (!byCategory[key]) {
            byCategory[key] = { name: t.category!.name, amount: 0, percentage: 0 };
          }
          byCategory[key].amount += Number(t.amount);
        });

      Object.values(byCategory).forEach((c) => {
        c.percentage = income > 0 ? (c.amount / income) * 100 : 0;
      });

      return NextResponse.json({
        period: { start: start.toISOString(), end: end.toISOString() },
        income,
        expenses,
        netProfit: income - expenses,
        netMargin: income > 0 ? ((income - expenses) / income) * 100 : 0,
        expensesByCategory: Object.values(byCategory).sort((a, b) => b.amount - a.amount),
      });
    }

    // ── Análise de Receita ────────────────────────────────────────────────────
    if (type === "revenue") {
      const incT = transactions.filter((t) => t.type === "INCOME");
      const totalIncome = incT.reduce((s, t) => s + Number(t.amount), 0);
      const transactionCount = incT.length;
      const dayCount = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );
      const weekCount = Math.max(1, Math.ceil(dayCount / 7));

      // --- By Product (income categories as "products") ---
      const productMap: Record<
        string,
        { name: string; color: string; amount: number; count: number }
      > = {};
      incT.forEach((t) => {
        const key = t.categoryId ?? "__none__";
        if (!productMap[key]) {
          productMap[key] = {
            name: t.category?.name ?? "Sem Categoria",
            color: t.category?.color ?? "#6b7280",
            amount: 0,
            count: 0,
          };
        }
        productMap[key].amount += Number(t.amount);
        productMap[key].count++;
      });
      const byProduct = Object.values(productMap)
        .map((p) => ({
          ...p,
          pctOfRevenue: totalIncome > 0 ? (p.amount / totalIncome) * 100 : 0,
          avgTicket: p.count > 0 ? p.amount / p.count : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      // --- By Customer (income contacts) ---
      const customerMap: Record<string, { name: string; amount: number; count: number }> = {};
      incT
        .filter((t) => t.contact)
        .forEach((t) => {
          const key = t.contactId!;
          if (!customerMap[key])
            customerMap[key] = { name: t.contact!.name, amount: 0, count: 0 };
          customerMap[key].amount += Number(t.amount);
          customerMap[key].count++;
        });
      const byCustomer = Object.values(customerMap)
        .map((c) => ({
          ...c,
          pctOfRevenue: totalIncome > 0 ? (c.amount / totalIncome) * 100 : 0,
          avgTicket: c.count > 0 ? c.amount / c.count : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      // --- By Week ---
      const weekMap: Record<
        string,
        { label: string; weekStart: string; amount: number; count: number }
      > = {};
      incT.forEach((t) => {
        const d = new Date(t.competenceDate);
        const ws = startOfWeek(d, { weekStartsOn: 0 });
        const we = endOfWeek(d, { weekStartsOn: 0 });
        const key = ws.toISOString().split("T")[0];
        if (!weekMap[key]) {
          weekMap[key] = {
            label: `${format(ws, "dd/MM", { locale: ptBR })}–${format(we, "dd/MM", { locale: ptBR })}`,
            weekStart: key,
            amount: 0,
            count: 0,
          };
        }
        weekMap[key].amount += Number(t.amount);
        weekMap[key].count++;
      });
      const byWeek = Object.values(weekMap)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map(({ label, amount, count }) => ({ label, amount, count }));
      const topWeek =
        byWeek.length > 0
          ? byWeek.reduce((best, w) => (w.amount > best.amount ? w : best), byWeek[0])
          : null;

      // --- By Day of Week (Mon–Sun order for BR) ---
      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const dowMap: Record<number, { amount: number; count: number }> = {};
      for (let i = 0; i < 7; i++) dowMap[i] = { amount: 0, count: 0 };
      incT.forEach((t) => {
        const dow = new Date(t.competenceDate).getDay();
        dowMap[dow].amount += Number(t.amount);
        dowMap[dow].count++;
      });
      // Order: Mon(1)→Sat(6)→Sun(0)
      const byDayOfWeek = [1, 2, 3, 4, 5, 6, 0].map((i) => ({
        day: dayNames[i],
        dayIndex: i,
        amount: dowMap[i].amount,
        count: dowMap[i].count,
      }));
      const bestDayOfWeek =
        totalIncome > 0
          ? byDayOfWeek.reduce((best, d) => (d.amount > best.amount ? d : best), byDayOfWeek[0])
          : null;

      // --- By Period of Month (1-10, 11-20, 21-end) ---
      const periodMap = [
        { label: "Dias 1–10", amount: 0, count: 0 },
        { label: "Dias 11–20", amount: 0, count: 0 },
        { label: "Dias 21–31", amount: 0, count: 0 },
      ];
      incT.forEach((t) => {
        const day = new Date(t.competenceDate).getDate();
        if (day <= 10) { periodMap[0].amount += Number(t.amount); periodMap[0].count++; }
        else if (day <= 20) { periodMap[1].amount += Number(t.amount); periodMap[1].count++; }
        else { periodMap[2].amount += Number(t.amount); periodMap[2].count++; }
      });

      return NextResponse.json({
        period: { start: start.toISOString(), end: end.toISOString() },
        summary: {
          totalIncome,
          transactionCount,
          avgPerDay: totalIncome / dayCount,
          avgPerWeek: totalIncome / weekCount,
          avgTicket: transactionCount > 0 ? totalIncome / transactionCount : 0,
          dayCount,
          weekCount,
        },
        byProduct,
        byCustomer,
        byWeek,
        topWeek,
        byDayOfWeek,
        bestDayOfWeek,
        byPeriodOfMonth: periodMap,
      });
    }

    // ── Análise Detalhada de Despesas ─────────────────────────────────────────
    if (type === "detailed-expenses") {
      const expT = transactions.filter((t) => t.type === "EXPENSE");
      const totalExpenses = expT.reduce((s, t) => s + Number(t.amount), 0);
      const totalIncome = transactions
        .filter((t) => t.type === "INCOME")
        .reduce((s, t) => s + Number(t.amount), 0);
      const dayCount = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );

      // --- By Category ---
      const catMap: Record<string, { name: string; color: string; amount: number; count: number }> = {};
      expT.forEach((t) => {
        const key = t.categoryId ?? "__none__";
        if (!catMap[key]) {
          catMap[key] = {
            name: t.category?.name ?? "Sem Categoria",
            color: t.category?.color ?? "#6b7280",
            amount: 0,
            count: 0,
          };
        }
        catMap[key].amount += Number(t.amount);
        catMap[key].count++;
      });
      const byCategory = Object.values(catMap)
        .map((c) => ({
          ...c,
          pctOfExpenses: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0,
          pctOfIncome: totalIncome > 0 ? (c.amount / totalIncome) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      // --- By Department ---
      const allDepts = await prisma.department.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, color: true, monthlyBudget: true },
      });
      const deptMetaMap = Object.fromEntries(
        allDepts.map((d) => [
          d.id,
          { color: d.color ?? "#10b981", budget: Number(d.monthlyBudget ?? 0) },
        ])
      );
      const budgetScale = dayCount / 30;
      const deptMap: Record<
        string,
        { name: string; color: string; amount: number; count: number; budget: number }
      > = {};
      expT.forEach((t) => {
        const key = t.departmentId ?? "__none__";
        if (!deptMap[key]) {
          const meta = t.departmentId
            ? (deptMetaMap[t.departmentId] ?? { color: "#6b7280", budget: 0 })
            : { color: "#6b7280", budget: 0 };
          deptMap[key] = {
            name: t.department?.name ?? "Sem Departamento",
            color: meta.color,
            amount: 0,
            count: 0,
            budget: meta.budget * budgetScale,
          };
        }
        deptMap[key].amount += Number(t.amount);
        deptMap[key].count++;
      });
      const byDepartment = Object.values(deptMap)
        .map((d) => ({
          ...d,
          pctOfExpenses: totalExpenses > 0 ? (d.amount / totalExpenses) * 100 : 0,
          budgetUtilPct: d.budget > 0 ? (d.amount / d.budget) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      // --- By Week ---
      const weekMap: Record<
        string,
        { label: string; weekStart: string; amount: number; count: number }
      > = {};
      expT.forEach((t) => {
        const d = new Date(t.competenceDate);
        const ws = startOfWeek(d, { weekStartsOn: 0 });
        const we = endOfWeek(d, { weekStartsOn: 0 });
        const key = ws.toISOString().split("T")[0];
        if (!weekMap[key]) {
          weekMap[key] = {
            label: `${format(ws, "dd/MM", { locale: ptBR })}–${format(we, "dd/MM", { locale: ptBR })}`,
            weekStart: key,
            amount: 0,
            count: 0,
          };
        }
        weekMap[key].amount += Number(t.amount);
        weekMap[key].count++;
      });
      const byWeek = Object.values(weekMap)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map(({ label, amount, count }) => ({ label, amount, count }));
      const topWeek =
        byWeek.length > 0
          ? byWeek.reduce((best, w) => (w.amount > best.amount ? w : best), byWeek[0])
          : null;

      // --- By Contact (employee / vendor) ---
      const contactMap: Record<string, { name: string; amount: number; count: number }> = {};
      expT
        .filter((t) => t.contact)
        .forEach((t) => {
          const key = t.contactId!;
          if (!contactMap[key]) contactMap[key] = { name: t.contact!.name, amount: 0, count: 0 };
          contactMap[key].amount += Number(t.amount);
          contactMap[key].count++;
        });
      const byContact = Object.values(contactMap)
        .map((c) => ({
          ...c,
          pctOfExpenses: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      // --- Payroll detection (categories with payroll keywords) ---
      const payrollRe = /folha|sal[aá]rio|remunera[cç][aã]o|holerite|pr[oó]-labore/i;
      const payrollT = expT.filter((t) => t.category && payrollRe.test(t.category.name));
      const payrollTotal = payrollT.reduce((s, t) => s + Number(t.amount), 0);

      const payrollDeptMap: Record<string, { name: string; amount: number }> = {};
      payrollT.forEach((t) => {
        const key = t.departmentId ?? "__none__";
        if (!payrollDeptMap[key]) {
          payrollDeptMap[key] = { name: t.department?.name ?? "Sem Departamento", amount: 0 };
        }
        payrollDeptMap[key].amount += Number(t.amount);
      });
      const payrollByDept = Object.values(payrollDeptMap)
        .map((d) => ({
          ...d,
          pctOfPayroll: payrollTotal > 0 ? (d.amount / payrollTotal) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      return NextResponse.json({
        period: { start: start.toISOString(), end: end.toISOString() },
        summary: {
          totalIncome,
          totalExpenses,
          netProfit: totalIncome - totalExpenses,
          netMargin: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0,
          expenseCount: expT.length,
          avgExpensePerDay: totalExpenses / dayCount,
        },
        byCategory,
        byDepartment,
        byWeek,
        topWeek,
        topDepartment: byDepartment[0] ?? null,
        byContact,
        topContact: byContact[0] ?? null,
        payroll: {
          total: payrollTotal,
          pctOfExpenses: totalExpenses > 0 ? (payrollTotal / totalExpenses) * 100 : 0,
          byDepartment: payrollByDept,
        },
      });
    }

    // Default: raw transactions
    return NextResponse.json({
      transactions: transactions.map((t) => ({ ...t, amount: Number(t.amount) })),
    });
  } catch (error) {
    console.error("Reports error:", error);
    return NextResponse.json({ error: "Erro ao gerar relatório" }, { status: 500 });
  }
}
