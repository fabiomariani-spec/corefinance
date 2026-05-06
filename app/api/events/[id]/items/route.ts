import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-handler";
import { parseBRDate } from "@/lib/dates";

export const POST = withAuth<{ id: string }>(async ({ companyId, params, req }) => {
  const { id: eventId } = params;
  const body = await req.json();

  // Verify event belongs to company
  const event = await prisma.event.findFirst({ where: { id: eventId, companyId } });
  if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });

  if (!body.description || body.amount === undefined) {
    return NextResponse.json({ error: "Descrição e valor são obrigatórios" }, { status: 400 });
  }

  const item = await prisma.eventItem.create({
    data: {
      eventId,
      companyId,
      description: body.description,
      amount:      body.amount,
      categoryId:  body.categoryId  || null,
      contactId:   body.contactId   || null,
      dueDate:     parseBRDate(body.dueDate),
      paymentMethod: body.paymentMethod || null,
      notes:       body.notes       || null,
      requestedBy: body.requestedBy || null,
      status:      body.status      || "DRAFT",
    },
    include: {
      category: { select: { id: true, name: true, color: true } },
      contact:  { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ ...item, amount: Number(item.amount) }, { status: 201 });
}, { errorMsg: "Erro ao criar lançamento" });
