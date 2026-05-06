import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";
import {
  generateSalaryTransactions,
  deleteFuturePendingSalary,
  cancelFutureSalary,
} from "@/lib/salary";

// ── PATCH /api/employees/[id] ─────────────────────────────────────────────────

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const existing = await prisma.employee.findFirst({ where: { id: params.id, companyId } });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const salaryChanged =
    body.salary !== undefined && Number(body.salary) !== Number(existing.salary);
  const dayChanged =
    body.dueDayOfMonth !== undefined && Number(body.dueDayOfMonth) !== existing.dueDayOfMonth;

  const updated = await prisma.employee.update({
    where: { id: params.id },
    data: {
      name: body.name?.trim() ?? existing.name,
      role: body.role !== undefined ? body.role?.trim() || null : existing.role,
      email: body.email !== undefined ? body.email?.trim() || null : existing.email,
      phone: body.phone !== undefined ? body.phone?.trim() || null : existing.phone,
      departmentId: body.departmentId !== undefined ? body.departmentId || null : existing.departmentId,
      salary: body.salary !== undefined ? Number(body.salary) : existing.salary,
      dueDayOfMonth: body.dueDayOfMonth !== undefined ? Number(body.dueDayOfMonth) : existing.dueDayOfMonth,
      hireDate: parseBRDate(body.hireDate) ?? existing.hireDate,
      birthDate: body.birthDate !== undefined ? parseBRDate(body.birthDate) : existing.birthDate,
      dismissDate: body.dismissDate !== undefined ? parseBRDate(body.dismissDate) : existing.dismissDate,
      notes: body.notes !== undefined ? body.notes?.trim() || null : existing.notes,
    },
  });

  // Regenerate salary transactions if salary/day changed and employee is ACTIVE
  if ((salaryChanged || dayChanged) && updated.status === "ACTIVE") {
    await deleteFuturePendingSalary(params.id);
    const cat = await prisma.category.findFirst({
      where: { companyId, name: "Folha de Pagamento", type: "EXPENSE" },
    });
    if (cat) await generateSalaryTransactions(updated, companyId, cat.id);
  }

  return { employee: updated };
}, { errorMsg: "Erro ao atualizar colaborador" });

// ── DELETE /api/employees/[id] ────────────────────────────────────────────────

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  const existing = await prisma.employee.findFirst({ where: { id: params.id, companyId } });
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Cancel all future pending transactions
  await cancelFutureSalary(params.id);

  // Unlink past transactions (keep history, just remove employee link)
  await prisma.transaction.updateMany({
    where: { employeeId: params.id },
    data: { employeeId: null },
  });

  await prisma.employee.delete({ where: { id: params.id } });
  return { ok: true };
}, { errorMsg: "Erro ao excluir colaborador" });
