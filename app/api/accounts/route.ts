import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function GET() {
  try {
    const companyId = await getCompanyId();

    const accounts = await prisma.account.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    });

    // Compute real current balance for each account:
    // currentBalance = openingBalance + sum(RECEIVED income) - sum(PAID expenses)
    const accountsWithBalance = await Promise.all(
      accounts.map(async (acc) => {
        const [incomeAgg, expenseAgg] = await Promise.all([
          prisma.transaction.aggregate({
            where: { accountId: acc.id, type: "INCOME", status: "RECEIVED" },
            _sum: { amount: true },
          }),
          prisma.transaction.aggregate({
            where: { accountId: acc.id, type: "EXPENSE", status: "PAID" },
            _sum: { amount: true },
          }),
        ]);

        const openingBalance = Number(acc.balance);
        const totalIncome = Number(incomeAgg._sum.amount ?? 0);
        const totalExpense = Number(expenseAgg._sum.amount ?? 0);
        const currentBalance = openingBalance + totalIncome - totalExpense;

        return {
          ...acc,
          openingBalance,
          balance: currentBalance,
        };
      })
    );

    return NextResponse.json(accountsWithBalance);
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

    const account = await prisma.account.create({
      data: {
        companyId,
        name: body.name,
        type: body.type ?? "CHECKING",
        bank: body.bank ?? null,
        agency: body.agency ?? null,
        accountNumber: body.accountNumber ?? null,
        balance: body.balance ?? 0,
        color: body.color ?? "#6366f1",
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar conta" }, { status: 500 });
  }
}
