import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate, parseBRDateOrNow } from "@/lib/dates";
import { generateSalaryTransactions } from "@/lib/salary";

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

// ── GET /api/employees ────────────────────────────────────────────────────────

export const GET = withAuth(async ({ companyId, req }) => {
  const status = req.nextUrl.searchParams.get("status");
  const departmentId = req.nextUrl.searchParams.get("departmentId");

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

  const active = employees.filter((e) => e.status === "ACTIVE");
  const totalMonthlyPayroll = active.reduce((s, e) => s + Number(e.salary), 0);

  return { employees, departments, totalMonthlyPayroll };
}, { errorMsg: "Erro ao buscar colaboradores" });

// ── POST /api/employees ───────────────────────────────────────────────────────

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();
  const { name, role, email, phone, departmentId, salary, dueDayOfMonth, hireDate, birthDate, notes } = body;

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
      hireDate: parseBRDateOrNow(hireDate),
      birthDate: parseBRDate(birthDate),
      notes: notes?.trim() || null,
      status: "ACTIVE",
    },
  });

  // Generate 12 months of salary transactions
  const cat = await findOrCreateSalaryCategory(companyId);
  await generateSalaryTransactions(employee, companyId, cat.id);

  return NextResponse.json({ employee }, { status: 201 });
}, { errorMsg: "Erro ao criar colaborador" });

// Export helpers for reuse in other routes
export { findOrCreateSalaryCategory, generateSalaryTransactions };
