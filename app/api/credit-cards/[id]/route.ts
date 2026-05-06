import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const PUT = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();
  await prisma.creditCard.updateMany({
    where: { id: params.id, companyId },
    data: {
      name: body.name,
      bank: body.bank,
      brand: body.brand,
      lastFour: body.lastFour,
      limit: body.limit,
      closingDay: body.closingDay,
      dueDay: body.dueDay,
      holder: body.holder,
      color: body.color,
    },
  });
  return { success: true };
});

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();
  // Whitelist de campos permitidos para edição parcial
  const allowed: Record<string, unknown> = {};
  for (const k of ["name", "bank", "brand", "lastFour", "limit", "closingDay", "dueDay", "holder", "color"]) {
    if (k in body) allowed[k] = body[k];
  }
  await prisma.creditCard.updateMany({
    where: { id: params.id, companyId },
    data: allowed,
  });
  return { success: true };
});

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  await prisma.creditCard.updateMany({
    where: { id: params.id, companyId },
    data: { isActive: false },
  });
  return { success: true };
});
