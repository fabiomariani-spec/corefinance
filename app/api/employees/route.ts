import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { addMonths, startOfMonth } from "date-fns";

// ── helpers ──────────────────────────────────────────────────────────────────

async function findOrCreateSalaryCategory(companyId: string) {
  let cat = await prisma.category.findFirst({
    where: { companyId, name: "Folha de Pagamento", type: "EXPENSE" },
  });
  if (!cat) {
    cat = await prisma.category.create({
      data: {
        companyId,
        name: "Folha de Pagamento",
        type: "EXPENSE",
        color: "#f59e0b",
        isDefault: false,
        isActive: true,
      },
    });
  }
  return cat;
}

async function generateSalaryTransactions(
  employee: { id: string; name: string; salary: unknown; dueDayOfMonth: number; departmentId: string | null },
  companyId: string,
  categoryId: string,
  months = 12
) {
  const today = new Date();
  const salary = Number(employee.salary);
  const transactions = Array.from({ length: months }, (_, i) => {
    const competence = startOfMonth(addMonths(today, i));
    const day = Math.min(employee.dueDayOfMonth, 28);
    const due = new Date(competence.getFullYear(), competence.getMonth(), day);
    return {
      companyId,
      employeeId: employee.id,
      description: `Salário — ${employee.name}`,
      amount: salary,
      type: "EXPENSE" as const,
      status: "PENDING" as const,
      competenceDate: competence,
      dueDate: due,
      categoryId,
      departmentId: employee.departmentId ?? null,
      isRecurring: true,
      recurrenceGroupId: `salary-${employee.id}`,
    };
  });
  await prisma.transaction.createMany({ data: transactions });
}

// ── GET /api/employees ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const departmentId = searchParams.get("departmentId");

    const where: Record<string, unknown> = { companyId };
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    const employees = await prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, color: true } },
        _count: {
          select: {
            transactions: { where: { status: "PENDING", dueDate: { gte: new Date() } } },
          },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    const departments = await prisma.department.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    });

    // Aggregates
    const active = employees.filter((e) => e.status === "ACTIVE");
    const totalMonthlyPayroll = active.reduce((s, e) => s + Number(e.salary), 0);

    return NextResponse.json({ employees, departments, totalMonthlyPayroll });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao buscar colaboradores" }, { status: 500 });
  }
}

// ── POST /api/employees ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await req.json();

    const { name, role, email, phone, departmentId, salary, dueDayOfMonth, hireDate, notes } = body;
    if (!name || !salary) {
      return NextResponse.json({ error: "Nome e salário são obrigatórios" }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: {
        companyId,
        name: name.trim(),
        role: role?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        departmentId: departmentId || null,
        salary: Number(salary),
        dueDayOfMonth: Number(dueDayOfMonth) || 5,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        notes: notes?.trim() || null,
        status: "ACTIVE",
      },
    });

    // Generate 12 months of salary transactions
    const cat = await findOrCreateSalaryCategory(companyId);
    await generateSalaryTransactions(employee, companyId, cat.id);

    return NextResponse.json({ employee }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar colaborador" }, { status: 500 });
  }
}

// Export helpers for reuse in other routes
export { findOrCreateSalaryCategory, generateSalaryTransactions };
