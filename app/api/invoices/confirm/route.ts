import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";
import type { Prisma } from "@prisma/client";

// Confirm pode demorar pra fatura com 500+ itens. Bumpa pra 240s.
export const maxDuration = 240;

interface ConfirmItem {
  date: string;
  description: string;
  amount: number;
  establishment: string | null;
  installmentInfo: string | null;
  categoryId: string | null;
  departmentId: string | null;
  include: boolean;
}

export const POST = withAuth(async ({ companyId, req }) => {
  const body = await req.json();

  const {
    creditCardId,
    referenceMonth,
    dueDate,
    paymentDate,
    totalAmount,
    items,
    summaryOnly,
    summaryCategoryId,
  }: {
    creditCardId: string;
    referenceMonth: string;
    dueDate: string;
    paymentDate: string | null;
    totalAmount: number;
    items: ConfirmItem[];
    summaryOnly?: boolean;
    summaryCategoryId?: string | null;
  } = body;

  // Parse reference month YYYY-MM → YYYYMM
  const refMonthInt = parseInt(referenceMonth.replace("-", ""));

  // Detect potential duplicates
  const existingInvoice = await prisma.creditCardInvoice.findFirst({
    where: { companyId, creditCardId, referenceMonth: refMonthInt },
  });

  let invoiceId: string;

  if (existingInvoice) {
    invoiceId = existingInvoice.id;
  } else {
    const invoice = await prisma.creditCardInvoice.create({
      data: {
        companyId,
        creditCardId,
        referenceMonth: refMonthInt,
        closingDate: new Date(referenceMonth + "-01"),
        dueDate: dueDate ? new Date(dueDate) : new Date(),
        totalAmount,
        status: "CLOSED",
        importedAt: new Date(),
        processedAt: new Date(),
      },
    });
    invoiceId = invoice.id;
  }

  // Modo "Importar só o total": cria UMA transação consolidada, ignora itens.
  if (summaryOnly) {
    const card = await prisma.creditCard.findFirst({
      where: { id: creditCardId, companyId },
      select: { name: true },
    });
    const isPaid = !!paymentDate;
    const tx = await prisma.transaction.create({
      data: {
        companyId,
        description: `Fatura ${card?.name ?? "cartão"} ${referenceMonth}`,
        amount: totalAmount,
        type: "EXPENSE",
        status: isPaid ? "PAID" : "PENDING",
        categoryId: summaryCategoryId || null,
        creditCardId,
        competenceDate: new Date(referenceMonth + "-01"),
        dueDate: dueDate ? new Date(dueDate) : new Date(),
        paymentDate: paymentDate ? parseBRDate(paymentDate) : null,
        paymentMethod: "CREDIT_CARD",
        importedFromInvoiceId: invoiceId,
        importSource: "invoice_import_summary",
      },
    });
    return {
      invoiceId,
      transactionsCreated: 1,
      skippedDuplicates: 0,
      summaryTransactionId: tx.id,
    };
  }

  // Create transactions for included items — em lote, não num for await
  const includedItems = items.filter((item) => item.include);
  const isPaid = !!paymentDate;
  const paymentDateParsed = paymentDate ? parseBRDate(paymentDate) : null;
  const dueDateParsed = parseBRDate(dueDate);

  // 1 query só: pega todas as transações já existentes desse cartão pra dedupe.
  // Limita aos últimos 90 dias pra não pegar histórico antigo.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const existingTxs = await prisma.transaction.findMany({
    where: {
      companyId,
      creditCardId,
      competenceDate: { gte: ninetyDaysAgo },
    },
    select: { description: true, amount: true, competenceDate: true },
  });
  // Index por chave determinística pra lookup O(1) em memória.
  const dupKey = (desc: string, amount: number, date: Date) =>
    `${desc.toLowerCase().trim()}|${amount.toFixed(2)}|${date.toISOString().slice(0, 10)}`;
  const existingKeys = new Set(
    existingTxs.map((t) => dupKey(t.description, Number(t.amount), t.competenceDate)),
  );

  // Monta payload completo, descartando duplicatas em memória.
  const toCreate: Prisma.TransactionCreateManyInput[] = [];
  let skipped = 0;
  for (const item of includedItems) {
    const competence = parseBRDate(item.date);
    if (!competence) continue;
    const description = item.establishment
      ? `${item.description} — ${item.establishment}`
      : item.description;
    const amount = Math.abs(item.amount);
    if (existingKeys.has(dupKey(description, amount, competence))) {
      skipped++;
      continue;
    }
    // Marca como duplicata futura dentro deste mesmo batch (mesma fatura
    // não pode importar dois itens idênticos consecutivos)
    existingKeys.add(dupKey(description, amount, competence));

    const isCredit = item.amount < 0;
    const status = isCredit
      ? (isPaid ? "RECEIVED" : "PENDING")
      : (isPaid ? "PAID" : "PENDING");
    toCreate.push({
      companyId,
      description,
      amount,
      type: isCredit ? "INCOME" : "EXPENSE",
      status,
      categoryId: item.categoryId || null,
      departmentId: item.departmentId || null,
      creditCardId,
      competenceDate: competence,
      dueDate: dueDateParsed,
      paymentDate: paymentDateParsed,
      paymentMethod: "CREDIT_CARD",
      importedFromInvoiceId: invoiceId,
      importSource: "invoice_import",
      notes: item.installmentInfo ? `Parcela ${item.installmentInfo}` : null,
    });
  }

  // createMany: 1 query, milhares de linhas inseridas em uma transação.
  let created = 0;
  if (toCreate.length > 0) {
    const result = await prisma.transaction.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    created = result.count;
  }

  return {
    invoiceId,
    transactionsCreated: created,
    skippedDuplicates: skipped,
  };
}, { errorMsg: "Erro ao confirmar importação" });
