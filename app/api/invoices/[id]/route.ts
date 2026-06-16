import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import type { Prisma, InvoiceStatus } from "@prisma/client";

// GET /api/invoices/[id]
// Detalhe da fatura + lista das transactions vinculadas via importedFromInvoiceId.
// Inclui contagem total e dado de cartão. Usa um único findFirst + uma busca
// das transactions (não dá pra usar relation porque o vínculo é por id solto).
export const GET = withAuth<{ id: string }>(async ({ companyId, params }) => {
  const invoice = await prisma.creditCardInvoice.findFirst({
    where: { id: params.id, companyId },
    include: {
      creditCard: {
        select: {
          id: true,
          name: true,
          brand: true,
          color: true,
          lastFour: true,
          bank: true,
          closingDay: true,
          dueDay: true,
        },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }

  const transactions = await prisma.transaction.findMany({
    where: { companyId, importedFromInvoiceId: params.id },
    orderBy: [{ competenceDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      description: true,
      amount: true,
      type: true,
      status: true,
      competenceDate: true,
      dueDate: true,
      paymentDate: true,
      paymentMethod: true,
      notes: true,
      installmentNumber: true,
      installmentTotal: true,
      category: { select: { id: true, name: true, color: true } },
      department: { select: { id: true, name: true, color: true } },
    },
  });

  // "Total da fatura" é DERIVADO dos lançamentos vinculados (compras − estornos),
  // não do totalAmount declarado na importação (que descolava da realidade).
  const computedTotal = transactions.reduce((sum, t) => {
    const amt = Number(t.amount);
    return sum + (t.type === "INCOME" ? -amt : amt);
  }, 0);

  return {
    id: invoice.id,
    creditCardId: invoice.creditCardId,
    referenceMonth: invoice.referenceMonth,
    closingDate: invoice.closingDate,
    dueDate: invoice.dueDate,
    totalAmount: computedTotal,
    status: invoice.status,
    fileName: invoice.fileName,
    fileUrl: invoice.fileUrl,
    importedAt: invoice.importedAt,
    processedAt: invoice.processedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    creditCard: invoice.creditCard,
    transactionsCount: transactions.length,
    transactions: transactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
    })),
  };
});

// PATCH /api/invoices/[id]
// Edição parcial: apenas status e dueDate são editáveis aqui. O total da fatura
// é derivado da soma dos lançamentos vinculados (não editável). Os outros campos
// (referenceMonth, closingDate, creditCardId) são imutáveis porque alterar
// mudaria a identidade da fatura. Pra trocar isso, exclua e reimporte.
const VALID_STATUSES: readonly InvoiceStatus[] = ["OPEN", "CLOSED", "PAID", "PROCESSING"];

export const PATCH = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const body = await req.json();

  const existing = await prisma.creditCardInvoice.findFirst({
    where: { id: params.id, companyId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }

  const data: Prisma.CreditCardInvoiceUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status as InvoiceStatus)) {
      return NextResponse.json(
        { error: `status inválido. Use: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    data.status = body.status as InvoiceStatus;
  }

  if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
    if (!body.dueDate) {
      return NextResponse.json({ error: "dueDate é obrigatório" }, { status: 400 });
    }
    // Aceita "YYYY-MM-DD" ou ISO completo. Normaliza pra noon local pra
    // evitar shift de timezone (mesma convenção do resto do projeto).
    const raw = String(body.dueDate);
    const dt = raw.length === 10 ? new Date(raw + "T12:00:00") : new Date(raw);
    if (isNaN(dt.getTime())) {
      return NextResponse.json({ error: "dueDate inválida" }, { status: 400 });
    }
    data.dueDate = dt;
  }

  if (Object.keys(data).length === 0) {
    return { success: true, updated: 0 };
  }

  await prisma.creditCardInvoice.update({
    where: { id: params.id },
    data,
  });

  return { success: true };
}, { errorMsg: "Erro ao atualizar fatura" });

// DELETE /api/invoices/[id]
// Hard delete da fatura + cascade nas transactions vinculadas
// (importedFromInvoiceId).
//
// Política de segurança:
//  - Bloqueia (409) se houver QUALQUER transaction com paymentDate definido.
//    Faturas com lançamentos já pagos não devem ser excluídas sem revisão
//    manual — o usuário tem que primeiro estornar/desvincular as pagas.
//  - Aceita ?force=true pra ignorar a checagem (usuário ciente).
//
// O CreditCardInvoice em si não tem cascade automático nas transactions
// (a relação é apenas via importedFromInvoiceId String?, sem FK), então fazemos
// o delete em transaction pra garantir atomicidade.
export const DELETE = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const force = req.nextUrl.searchParams.get("force") === "true";

  const invoice = await prisma.creditCardInvoice.findFirst({
    where: { id: params.id, companyId },
    select: { id: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
  }

  if (!force) {
    const paidCount = await prisma.transaction.count({
      where: {
        companyId,
        importedFromInvoiceId: params.id,
        paymentDate: { not: null },
      },
    });
    if (paidCount > 0) {
      return NextResponse.json(
        {
          error: "Fatura possui lançamentos já pagos",
          paidTransactionsCount: paidCount,
          hint: "Use ?force=true para excluir mesmo assim",
        },
        { status: 409 },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedTxs = await tx.transaction.deleteMany({
      where: { companyId, importedFromInvoiceId: params.id },
    });
    // InvoiceItems têm onDelete: Cascade na FK invoiceId, então caem juntos.
    await tx.creditCardInvoice.delete({ where: { id: params.id } });
    return { deletedTransactions: deletedTxs.count };
  });

  return { success: true, ...result };
}, { errorMsg: "Erro ao excluir fatura" });
