import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const companyId = await getCompanyId();
    const { id: eventId, itemId } = await params;

    const item = await prisma.eventItem.findFirst({
      where: { id: itemId, companyId, eventId },
      include: { event: { select: { name: true, departmentId: true } } },
    });

    if (!item) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    if (!["DRAFT", "PENDING_APPROVAL"].includes(item.status)) {
      return NextResponse.json({ error: "Lançamento não está disponível para aprovação" }, { status: 400 });
    }

    // Validate dates — fallback to today if null/invalid
    const safeDate = (d: Date | null | undefined): Date => {
      if (!d) return new Date();
      const t = new Date(d);
      return isNaN(t.getTime()) ? new Date() : t;
    };

    const dueDate       = safeDate(item.dueDate);
    const competenceDate = safeDate(item.dueDate);

    // Create a real Transaction in the financial system
    const transaction = await prisma.transaction.create({
      data: {
        companyId,
        description:   `[Evento: ${item.event.name}] ${item.description}`,
        amount:        item.amount,
        type:          "EXPENSE",
        status:        "PENDING",
        categoryId:    item.categoryId    || null,
        contactId:     item.contactId     || null,
        departmentId:  item.event.departmentId || null,
        dueDate,
        competenceDate,
        eventItemId:   item.id,
        importSource:  "event_approval",
        notes:         item.notes         || null,
        paymentMethod: item.paymentMethod ? (item.paymentMethod as "CREDIT_CARD" | "DEBIT_CARD" | "BANK_TRANSFER" | "PIX" | "BOLETO" | "CASH" | "CHECK" | "OTHER") : null,
        tags:          [],
      },
    });

    // Update EventItem: INTEGRATED + link to transaction
    await prisma.eventItem.update({
      where: { id: itemId },
      data: { status: "INTEGRATED", transactionId: transaction.id },
    });

    return NextResponse.json({ success: true, transactionId: transaction.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro ao aprovar lançamento" }, { status: 500 });
  }
}
