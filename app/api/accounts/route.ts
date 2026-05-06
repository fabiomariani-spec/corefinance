import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";

export const GET = withAuth(async ({ companyId }) => {
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });

  // Compute real current balance: single grouped query instead of N*2
  const txByAccount = await prisma.transaction.groupBy({
    by: ["accountId", "type"],
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      OR: [
        { type: "INCOME", status: "RECEIVED" },
        { type: "EXPENSE", status: "PAID" },
      ],
    },
    _sum: { amount: true },
  });

  const accIncMap: Record<string, number> = {};
  const accExpMap: Record<string, number> = {};
  for (const r of txByAccount) {
    if (!r.accountId) continue;
    if (r.type === "INCOME") accIncMap[r.accountId] = Number(r._sum.amount ?? 0);
    else accExpMap[r.accountId] = Number(r._sum.amount ?? 0);
  }

  return accounts.map((acc) => {
    const openingBalance = Number(acc.balance);
    const currentBalance = openingBalance + (accIncMap[acc.id] ?? 0) - (accExpMap[acc.id] ?? 0);
    return { ...acc, openingBalance, balance: currentBalance };
  });
});

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();
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
}, { errorMsg: "Erro ao criar conta" });
