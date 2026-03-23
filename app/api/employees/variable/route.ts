import { NextRequest, NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const month = request.nextUrl.searchParams.get("month");
    if (!month) return NextResponse.json({ error: "month é obrigatório" }, { status: 400 });

    const records = await prisma.variableCompensation.findMany({
      where: { companyId, month },
      select: {
        id: true,
        employeeId: true,
        amount: true,
        description: true,
        month: true,
        paymentDate: true,
      },
    });

    // Also get summary by month (last 6 months)
    const allRecords = await prisma.variableCompensation.findMany({
      where: { companyId },
      select: { month: true, amount: true, employeeId: true },
      orderBy: { month: "desc" },
    });

    // Build monthly summary
    const monthlyMap = new Map<string, { total: number; count: number }>();
    for (const r of allRecords) {
      const m = monthlyMap.get(r.month) ?? { total: 0, count: 0 };
      m.total += Number(r.amount);
      m.count += 1;
      monthlyMap.set(r.month, m);
    }
    const monthlySummary = Array.from(monthlyMap.entries())
      .map(([m, d]) => ({ month: m, total: d.total, count: d.count }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 6);

    // Employee totals for the requested month
    const employeeMap = new Map<string, { amount: number; description: string | null; paymentDate: string | null }>();
    for (const r of records) {
      employeeMap.set(r.employeeId, {
        amount: Number(r.amount),
        description: r.description,
        paymentDate: r.paymentDate ? r.paymentDate.toISOString().split("T")[0] : null,
      });
    }

    return NextResponse.json({
      records: Object.fromEntries(employeeMap),
      monthlySummary,
    });
  } catch (err) {
    console.error("GET /api/employees/variable:", err);
    return NextResponse.json({ error: "Erro ao carregar variáveis" }, { status: 500 });
  }
}

async function findOrCreateVarCategory(companyId: string) {
  let cat = await prisma.category.findFirst({
    where: { companyId, name: "Remuneração Variável", type: "EXPENSE" },
  });
  if (!cat) {
    cat = await prisma.category.create({
      data: { companyId, name: "Remuneração Variável", type: "EXPENSE", color: "#f59e0b", isDefault: true },
    });
  }
  return cat.id;
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const { employeeId, month, amount, description, paymentDate } = body;

    if (!employeeId || !month) {
      return NextResponse.json({ error: "employeeId e month são obrigatórios" }, { status: 400 });
    }

    const numAmount = Number(amount);
    const txTag = `var:${employeeId}:${month}`;

    if (numAmount <= 0) {
      // Delete variable record + associated transaction
      await prisma.variableCompensation.deleteMany({
        where: { employeeId, month, companyId },
      });
      await prisma.transaction.deleteMany({
        where: { companyId, tags: { has: txTag } },
      });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // Resolve payment date: user override or fall back to employee.dueDayOfMonth
    const resolvedPaymentDate: Date | null = paymentDate
      ? new Date(paymentDate + "T12:00:00")
      : null;

    // Upsert variable compensation
    const record = await prisma.variableCompensation.upsert({
      where: { employeeId_month: { employeeId, month } },
      update: { amount: numAmount, description: description || null, paymentDate: resolvedPaymentDate },
      create: { companyId, employeeId, month, amount: numAmount, description: description || null, paymentDate: resolvedPaymentDate },
    });

    // Get employee details for the transaction
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true, departmentId: true, dueDayOfMonth: true },
    });

    if (!employee) {
      return NextResponse.json({ ok: true, record });
    }

    const categoryId = await findOrCreateVarCategory(companyId);
    const [y, m] = month.split("-");
    const competenceDate = new Date(`${month}-01T12:00:00`);
    // Use user-selected date if provided, otherwise derive from employee.dueDayOfMonth
    const dueDate = resolvedPaymentDate
      ?? new Date(`${y}-${m}-${String(employee.dueDayOfMonth ?? 5).padStart(2, "0")}T12:00:00`);
    const txDescription = `Remuneração Variável — ${employee.name}`;

    // Upsert transaction (find by tag, update or create)
    const existingTx = await prisma.transaction.findFirst({
      where: { companyId, tags: { has: txTag } },
    });

    if (existingTx) {
      await prisma.transaction.update({
        where: { id: existingTx.id },
        data: {
          amount: numAmount,
          description: txDescription,
          notes: description || null,
          dueDate,
        },
      });
    } else {
      await prisma.transaction.create({
        data: {
          companyId,
          description: txDescription,
          amount: numAmount,
          type: "EXPENSE",
          status: "PAID",
          isPredicted: false,
          isRecurring: false,
          categoryId,
          departmentId: employee.departmentId,
          employeeId,
          competenceDate,
          dueDate,
          paymentDate: new Date(),
          tags: [txTag],
          notes: description || null,
        },
      });
    }

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    console.error("POST /api/employees/variable:", err);
    return NextResponse.json({ error: "Erro ao salvar variável", detail: String(err) }, { status: 500 });
  }
}
