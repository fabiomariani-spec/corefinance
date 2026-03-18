import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET() {
  try {
    const companyId = await getCompanyId();
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

    return NextResponse.json(
      cards.map((card) => ({
        ...card,
        usedAmount: card.transactions.reduce((s, t) => s + Number(t.amount), 0),
        transactions: undefined,
      }))
    );
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

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
  } catch {
    return NextResponse.json({ error: "Erro ao criar cartão" }, { status: 500 });
  }
}
