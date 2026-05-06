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
    totalAmount,
    items,
  }: {
    creditCardId: string;
    referenceMonth: string;
    dueDate: string;
    totalAmount: number;
    items: ConfirmItem[];
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
    const tx = await prisma.transaction.create({
      data: {
        companyId,
        description: item.establishment
          ? `${item.description} — ${item.establishment}`
          : item.description,
        amount: Math.abs(item.amount),
        type: isCredit ? "INCOME" : "EXPENSE",
        status: isCredit ? "RECEIVED" : "PAID",
        categoryId: item.categoryId || null,
        departmentId: item.departmentId || null,
        creditCardId,
        competenceDate: parseBRDate(item.date)!,
        dueDate: parseBRDate(dueDate),
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
