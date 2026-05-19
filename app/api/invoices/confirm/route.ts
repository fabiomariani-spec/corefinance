import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";

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

  // Create transactions for included items
  const includedItems = items.filter((item) => item.include);
  const created: string[] = [];

  for (const item of includedItems) {
    // Check for duplicates: same description + amount + date + creditCard
    const existing = await prisma.transaction.findFirst({
      where: {
        companyId,
        creditCardId,
        description: { equals: item.description, mode: "insensitive" },
        amount: Math.abs(item.amount),
        competenceDate: {
          gte: new Date(new Date(item.date).setHours(0, 0, 0, 0)),
          lte: new Date(new Date(item.date).setHours(23, 59, 59, 999)),
        },
      },
    });

    if (existing) continue; // Skip duplicate

    const isCredit = item.amount < 0;
    // Se o usuário informou paymentDate, marca como PAID/RECEIVED.
    // Sem paymentDate: PENDING/PREDICTED — vai aparecer no /lancamentos
    // como pendente ordenado pelo dueDate.
    const isPaid = !!paymentDate;
    const status = isCredit
      ? (isPaid ? "RECEIVED" : "PENDING")
      : (isPaid ? "PAID" : "PENDING");
    const tx = await prisma.transaction.create({
      data: {
        companyId,
        description: item.establishment
          ? `${item.description} — ${item.establishment}`
          : item.description,
        amount: Math.abs(item.amount),
        type: isCredit ? "INCOME" : "EXPENSE",
        status,
        categoryId: item.categoryId || null,
        departmentId: item.departmentId || null,
        creditCardId,
        competenceDate: parseBRDate(item.date)!,
        dueDate: parseBRDate(dueDate),
        paymentDate: paymentDate ? parseBRDate(paymentDate) : null,
        paymentMethod: "CREDIT_CARD",
        importedFromInvoiceId: invoiceId,
        importSource: "invoice_import",
        notes: item.installmentInfo
          ? `Parcela ${item.installmentInfo}`
          : null,
      },
    });

    created.push(tx.id);
  }

  return {
    invoiceId,
    transactionsCreated: created.length,
    skippedDuplicates: includedItems.length - created.length,
  };
}, { errorMsg: "Erro ao confirmar importação" });
