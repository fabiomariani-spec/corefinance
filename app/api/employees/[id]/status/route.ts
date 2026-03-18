import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";
import { addMonths, startOfMonth } from "date-fns";

async function cancelFutureSalary(employeeId: string) {
  await prisma.transaction.updateMany({
    where: { employeeId, status: "PENDING", dueDate: { gte: new Date() } },
    data: { status: "CANCELLED" },
  });
}

async function regenerateSalary(
  employee: { id: string; name: string; salary: unknown; dueDayOfMonth: number; departmentId: string | null },
  companyId: string
) {
  const cat = await prisma.category.findFirst({
    where: { companyId, name: "Folha de Pagamento", type: "EXPENSE" },
  });
  if (!cat) return;

  const today = new Date();
  const salary = Number(employee.salary);
  const transactions = Array.from({ length: 12 }, (_, i) => {
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
      categoryId: cat.id,
      departmentId: employee.departmentId ?? null,
      isRecurring: true,
      recurrenceGroupId: `salary-${employee.id}`,
    };
  });
  await prisma.transaction.createMany({ data: transactions });
}

// ── POST /api/employees/[id]/status ──────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id } = await params;
    const { status } = await req.json();

    if (!["ACTIVE", "PAUSED", "DISMISSED"].includes(status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const existing = await prisma.employee.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const data: Record<string, unknown> = { status };
    if (status === "DISMISSED") data.dismissDate = new Date();
    if (status === "ACTIVE") data.dismissDate = null;

    const updated = await prisma.employee.update({ where: { id }, data });

    if (status === "PAUSED" || status === "DISMISSED") {
      await cancelFutureSalary(id);
    } else if (status === "ACTIVE") {
      // Reactivating: cancel any cancelled ones (already done) and regenerate
      await regenerateSalary(updated, companyId);
    }

    return NextResponse.json({ employee: updated });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao alterar status" }, { status: 500 });
  }
}
