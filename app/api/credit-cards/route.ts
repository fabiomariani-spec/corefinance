import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async ({ companyId }) => {
  const cards = await prisma.creditCard.findMany({
    where: { companyId, isActive: true },
    include: {
      transactions: {
        where: {
          competenceDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lte: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
          },
          status: { not: "CANCELLED" },
        },
        select: { amount: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return cards.map((card) => ({
    ...card,
    usedAmount: card.transactions.reduce((s, t) => s + Number(t.amount), 0),
    transactions: undefined,
  }));
});

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();
  const card = await prisma.creditCard.create({
    data: {
      companyId,
      name: body.name,
      bank: body.bank ?? null,
      brand: body.brand ?? "OTHER",
      lastFour: body.lastFour ?? null,
      limit: body.limit ?? 0,
      closingDay: body.closingDay ?? 1,
      dueDay: body.dueDay ?? 10,
      holder: body.holder ?? null,
      color: body.color ?? "#8b5cf6",
    },
  });
  return NextResponse.json(card, { status: 201 });
}, { errorMsg: "Erro ao criar cartão" });
