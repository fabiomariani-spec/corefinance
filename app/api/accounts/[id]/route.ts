import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const PUT = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  await prisma.account.updateMany({
    where: { id: params.id, companyId },
    data: {
      name: body.name,
      type: body.type,
      bank: body.bank,
      agency: body.agency,
      accountNumber: body.accountNumber,
      balance: body.balance,
      color: body.color,
    },
  });

  return { success: true };
});

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  // Only update fields explicitly present in the request body (partial update)
  const data: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) data.name = body.name;
  if (Object.prototype.hasOwnProperty.call(body, "type")) data.type = body.type;
  if (Object.prototype.hasOwnProperty.call(body, "bank")) data.bank = body.bank;
  if (Object.prototype.hasOwnProperty.call(body, "agency")) data.agency = body.agency;
  if (Object.prototype.hasOwnProperty.call(body, "accountNumber")) data.accountNumber = body.accountNumber;
  if (Object.prototype.hasOwnProperty.call(body, "balance")) data.balance = body.balance;
  if (Object.prototype.hasOwnProperty.call(body, "color")) data.color = body.color;

  if (Object.keys(data).length === 0) {
    return { success: true };
  }

  await prisma.account.updateMany({
    where: { id: params.id, companyId },
    data,
  });

  return { success: true };
});

export const DELETE = withAuth<{ id: string }>(async ({ companyId, params }) => {
  await prisma.account.updateMany({
    where: { id: params.id, companyId },
    data: { isActive: false },
  });

  return { success: true };
});
