import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";

type Params = { id: string; itemId: string };

export const PUT = withAuth<Params>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.description   !== undefined) data.description   = body.description;
  if (body.amount        !== undefined) data.amount        = body.amount;
  if (body.categoryId    !== undefined) data.categoryId    = body.categoryId    || null;
  if (body.contactId     !== undefined) data.contactId     = body.contactId     || null;
  if (body.dueDate       !== undefined) data.dueDate       = parseBRDate(body.dueDate);
  if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null;
  if (body.notes         !== undefined) data.notes         = body.notes         || null;
  if (body.requestedBy   !== undefined) data.requestedBy   = body.requestedBy   || null;
  if (body.status        !== undefined) data.status        = body.status;

  await prisma.eventItem.updateMany({ where: { id: params.itemId, companyId }, data });
  return { success: true };
}, { errorMsg: "Erro ao atualizar" });

export const DELETE = withAuth<Params>(async ({ companyId, params }) => {
  await prisma.eventItem.deleteMany({ where: { id: params.itemId, companyId } });
  return { success: true };
}, { errorMsg: "Erro ao excluir" });
