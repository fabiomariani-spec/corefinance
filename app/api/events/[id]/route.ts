import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";

export const GET = withAuth<{ id: string }>(async ({ companyId, params }) => {
  const event = await prisma.event.findFirst({
    where: { id: params.id, companyId },
    include: {
      department: { select: { id: true, name: true, color: true } },
      items: {
        include: {
          category: { select: { id: true, name: true, color: true } },
          contact:  { select: { id: true, name: true } },
          transaction: { select: { id: true, status: true, paymentDate: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!event) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Sync INTEGRATED items that are now PAID in the transaction
  const items = event.items.map((item) => {
    let status = item.status;
    if (item.status === "INTEGRATED" && item.transaction?.status === "PAID") {
      status = "PAID" as typeof item.status;
    }
    return { ...item, amount: Number(item.amount), status };
  });

  const budget   = Number(event.budget);
  const planned  = items.filter((i) => !["CANCELLED", "REJECTED"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
  const approved = items.filter((i) => ["INTEGRATED", "PAID"].includes(i.status)).reduce((s, i) => s + i.amount, 0);
  const paid     = items.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const pending  = items.filter((i) => i.status === "PENDING_APPROVAL").reduce((s, i) => s + i.amount, 0);
  const rejected = items.filter((i) => i.status === "REJECTED").reduce((s, i) => s + i.amount, 0);

  return {
    ...event,
    budget,
    items,
    totals: { budget, planned, approved, paid, pending, rejected, balance: budget - planned },
  };
});

export const PUT = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name        !== undefined) data.name        = body.name;
  if (body.type        !== undefined) data.type        = body.type || null;
  if (body.startDate   !== undefined) data.startDate   = parseBRDate(body.startDate);
  if (body.endDate     !== undefined) data.endDate     = parseBRDate(body.endDate);
  if (body.location    !== undefined) data.location    = body.location || null;
  if (body.responsible !== undefined) data.responsible = body.responsible || null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.budget      !== undefined) data.budget      = body.budget;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
  if (body.status      !== undefined) data.status      = body.status;

  await prisma.event.updateMany({ where: { id: params.id, companyId }, data });
  return { success: true };
}, { errorMsg: "Erro ao atualizar" });

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  await prisma.event.deleteMany({ where: { id: params.id, companyId } });
  return { success: true };
}, { errorMsg: "Erro ao excluir" });
