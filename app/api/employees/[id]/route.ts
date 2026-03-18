import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { addMonths, startOfMonth } from "date-fns";

async function cancelFutureSalary(employeeId: string) {
  await prisma.transaction.updateMany({
    where: {
      employeeId,
      status: "PENDING",
      dueDate: { gte: new Date() },
    },
    data: { status: "CANCELLED" },
  });
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

// ── PATCH /api/employees/[id] ─────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.employee.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const salaryChanged =
      body.salary !== undefined && Number(body.salary) !== Number(existing.salary);
    const dayChanged =
      body.dueDayOfMonth !== undefined && Number(body.dueDayOfMonth) !== existing.dueDayOfMonth;

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? existing.name,
        role: body.role !== undefined ? body.role?.trim() || null : existing.role,
        email: body.email !== undefined ? body.email?.trim() || null : existing.email,
        phone: body.phone !== undefined ? body.phone?.trim() || null : existing.phone,
        departmentId: body.departmentId !== undefined ? body.departmentId || null : existing.departmentId,
        salary: body.salary !== undefined ? Number(body.salary) : existing.salary,
        dueDayOfMonth: body.dueDayOfMonth !== undefined ? Number(body.dueDayOfMonth) : existing.dueDayOfMonth,
        hireDate: body.hireDate ? new Date(body.hireDate) : existing.hireDate,
        notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
      },
    });

    // Regenerate salary transactions if salary/day changed and employee is ACTIVE
    if ((salaryChanged || dayChanged) && updated.status === "ACTIVE") {
      await cancelFutureSalary(id);
      const cat = await prisma.category.findFirst({
        where: { companyId, name: "Folha de Pagamento", type: "EXPENSE" },
      });
      if (cat) await generateSalaryTransactions(updated, companyId, cat.id);
    }

    return NextResponse.json({ employee: updated });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao atualizar colaborador" }, { status: 500 });
  }
}

// ── DELETE /api/employees/[id] ────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;

    const existing = await prisma.employee.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    // Cancel all future pending transactions
    await cancelFutureSalary(id);

    // Unlink past transactions (keep history, just remove employee link)
    await prisma.transaction.updateMany({
      where: { employeeId: id },
      data: { employeeId: null },
    });

    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao excluir colaborador" }, { status: 500 });
  }
}
