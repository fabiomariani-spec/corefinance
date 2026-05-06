import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth<{ id: string }>(async ({ companyId, params }) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: params.id, companyId },
    include: {
      category: true,
      department: true,
      contact: true,
      account: true,
      creditCard: true,
      attachments: true,
    },
  });

  if (!transaction) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return transaction;
});

export const PUT = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  // Only include fields that were explicitly sent — avoids clearing accountId etc. on partial updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (body.description !== undefined) data.description = body.description;
  if (body.amount !== undefined) data.amount = body.amount;
  if (body.type !== undefined) data.type = body.type;
  if (body.status !== undefined) data.status = body.status;
  if (body.isPredicted !== undefined) data.isPredicted = body.isPredicted;
  if (body.isRecurring !== undefined) data.isRecurring = body.isRecurring;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
  if (body.employeeId !== undefined) data.employeeId = body.employeeId || null;
  if (body.contactId !== undefined) data.contactId = body.contactId || null;
  if (body.accountId !== undefined) data.accountId = body.accountId || null;
  if (body.creditCardId !== undefined) data.creditCardId = body.creditCardId || null;
  // Store at local noon (T12:00:00) to avoid UTC midnight → wrong day in BR timezone
  if (body.competenceDate !== undefined) data.competenceDate = new Date(body.competenceDate + "T12:00:00");
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate + "T12:00:00") : null;
  if (body.paymentDate !== undefined) data.paymentDate = body.paymentDate ? new Date(body.paymentDate + "T12:00:00") : null;
  if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.tags !== undefined) data.tags = body.tags;

  const transaction = await prisma.transaction.updateMany({
    where: { id: params.id, companyId },
    data,
  });

  // ── Propagate category/department to future transactions in the same group ──
  if (body.propagateFuture && (body.categoryId !== undefined || body.departmentId !== undefined)) {
    const current = await prisma.transaction.findFirst({
      where: { id: params.id, companyId },
      select: { installmentGroupId: true, installmentNumber: true },
    });

    if (current?.installmentGroupId) {
      const propagateData: Record<string, unknown> = {};
      if (body.categoryId !== undefined) propagateData.categoryId = body.categoryId || null;
      if (body.departmentId !== undefined) propagateData.departmentId = body.departmentId || null;

      await prisma.transaction.updateMany({
        where: {
          companyId,
          installmentGroupId: current.installmentGroupId,
          installmentNumber: { gt: current.installmentNumber ?? 0 },
          status: { in: ["PENDING", "PREDICTED", "OVERDUE"] },
        },
        data: propagateData,
      });
    }
  }

  return { updated: transaction.count };
}, { errorMsg: "Erro ao atualizar" });

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  await prisma.transaction.deleteMany({
    where: { id: params.id, companyId },
  });
  return { success: true };
}, { errorMsg: "Erro ao excluir" });
