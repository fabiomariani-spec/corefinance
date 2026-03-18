import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

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

export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();

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
          competenceDate: new Date(item.date),
          dueDate: dueDate ? new Date(dueDate) : null,
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

    return NextResponse.json({
      invoiceId,
      transactionsCreated: created.length,
      skippedDuplicates: includedItems.length - created.length,
    });
  } catch (error) {
    console.error("Invoice confirm error:", error);
    return NextResponse.json(
      { error: "Erro ao confirmar importação" },
      { status: 500 }
    );
  }
}
