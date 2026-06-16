import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import type { Prisma, InvoiceStatus } from "@prisma/client";

const VALID_STATUSES: readonly InvoiceStatus[] = ["OPEN", "CLOSED", "PAID", "PROCESSING"];

// Lista todas as faturas (CreditCardInvoice) da empresa, ordenadas por
// referenceMonth desc. Suporta filtros opcionais via query string.
//
// ?cardId=...  filtra por cartão
// ?status=...  filtra por InvoiceStatus (OPEN/CLOSED/PAID/PROCESSING)
//
// Cada item inclui o cartão (nome, brand, color) e a contagem de transactions
// vinculadas via `importedFromInvoiceId`. Isso evita N+1 na lista.
export const GET = withAuth(async ({ companyId, req }) => {
  const { searchParams } = req.nextUrl;
  const cardId = searchParams.get("cardId");
  const statusParam = searchParams.get("status");

  const where: Prisma.CreditCardInvoiceWhereInput = { companyId };
  if (cardId) where.creditCardId = cardId;
  if (statusParam && VALID_STATUSES.includes(statusParam as InvoiceStatus)) {
    where.status = statusParam as InvoiceStatus;
  }

  const invoices = await prisma.creditCardInvoice.findMany({
    where,
    orderBy: [{ referenceMonth: "desc" }, { createdAt: "desc" }],
    include: {
      creditCard: {
        select: { id: true, name: true, brand: true, color: true, lastFour: true },
      },
    },
  });

  // Conta E soma as transactions vinculadas em uma única query agrupada
  // (evita N+1). O "Total da fatura" é DERIVADO dos lançamentos efetivamente
  // vinculados (compras − estornos), não do totalAmount declarado na importação
  // — esse campo era um retrato da extração da IA e descolava da realidade
  // (reimportação não o atualiza, dedupe/edições mudam os lançamentos).
  const txAgg = invoices.length === 0
    ? []
    : await prisma.transaction.groupBy({
        by: ["importedFromInvoiceId", "type"],
        where: {
          companyId,
          importedFromInvoiceId: { in: invoices.map((i) => i.id) },
        },
        _count: { _all: true },
        _sum: { amount: true },
      });

  const countMap: Record<string, number> = {};
  const totalMap: Record<string, number> = {};
  for (const row of txAgg) {
    const invId = row.importedFromInvoiceId;
    if (!invId) continue;
    countMap[invId] = (countMap[invId] ?? 0) + row._count._all;
    const sum = Number(row._sum.amount ?? 0);
    totalMap[invId] = (totalMap[invId] ?? 0) + (row.type === "INCOME" ? -sum : sum);
  }

  return invoices.map((inv) => ({
    id: inv.id,
    creditCardId: inv.creditCardId,
    referenceMonth: inv.referenceMonth,
    closingDate: inv.closingDate,
    dueDate: inv.dueDate,
    totalAmount: totalMap[inv.id] ?? 0,
    status: inv.status,
    fileName: inv.fileName,
    fileUrl: inv.fileUrl,
    importedAt: inv.importedAt,
    processedAt: inv.processedAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    creditCard: inv.creditCard,
    transactionsCount: countMap[inv.id] ?? 0,
  }));
});
